-- PRD multi-factor authentication. Supabase Auth owns the authenticator
-- factors themselves; this adds single-use recovery codes, the history, and
-- the rule that an account with a second step cannot reach the API on a
-- password-only session.

create table public.mfa_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  -- Only a hash is kept; the codes are shown once, when they are made.
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index mfa_recovery_codes_owner on public.mfa_recovery_codes(profile_id);
alter table public.mfa_recovery_codes enable row level security;
revoke all on public.mfa_recovery_codes from anon, authenticated;

create table public.mfa_recovery_attempts (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  attempted_at timestamptz not null default clock_timestamp()
);
create index mfa_recovery_attempts_owner on public.mfa_recovery_attempts(profile_id, attempted_at desc);
alter table public.mfa_recovery_attempts enable row level security;
revoke all on public.mfa_recovery_attempts from anon, authenticated;

create function private.session_aal()
returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'aal', 'aal1');
$$;

create function private.has_verified_factor(p_profile_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from auth.mfa_factors where user_id = p_profile_id and status = 'verified');
$$;
revoke all on function private.has_verified_factor(uuid) from public, anon, authenticated;

create function private.recovery_hash(p_profile_id uuid, p_code text)
returns text language sql immutable as $$
  select encode(sha256(convert_to(p_profile_id::text || ':' || lower(regexp_replace(coalesce(p_code, ''), '[^0-9a-fA-F]', '', 'g')), 'UTF8')), 'hex');
$$;

-- Replaces any earlier set. Only a session that has passed the second step
-- may ask for codes, so a stolen password cannot mint a way round it.
create function public.create_mfa_recovery_codes()
returns text[] language plpgsql security definer set search_path = public as $$
declare v_codes text[] := '{}'; v_code text;
begin
  perform 1 from public.profiles where id = auth.uid() and deleted_at is null for update;
  if not found then raise exception 'not authenticated'; end if;
  if private.session_aal() <> 'aal2' or not private.has_verified_factor(auth.uid()) then
    raise exception 'mfa_required';
  end if;
  delete from public.mfa_recovery_codes where profile_id = auth.uid();
  for i in 1..8 loop
    v_code := substr(md5(gen_random_uuid()::text), 1, 5) || '-' || substr(md5(gen_random_uuid()::text), 1, 5);
    v_codes := v_codes || v_code;
    insert into public.mfa_recovery_codes(profile_id, code_hash) values (auth.uid(), private.recovery_hash(auth.uid(), v_code));
  end loop;
  if not exists(select 1 from public.security_events where profile_id = auth.uid() and kind = 'mfa_enrolled'
      and created_at > now() - interval '10 minutes') then
    insert into public.security_events(profile_id, kind) values (auth.uid(), 'mfa_enrolled');
    perform public.notify(auth.uid(), 'system', 'Two-step sign-in is on',
      'You will be asked for a code from your authenticator app when you sign in.', 'security', null);
  end if;
  return v_codes;
end;
$$;

-- Called by the app after it removes the authenticator. Drops the recovery
-- codes with it and tells the owner, in case it was not them.
create function public.record_mfa_removed()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if private.has_verified_factor(auth.uid()) then return; end if;
  delete from public.mfa_recovery_codes where profile_id = auth.uid();
  if not exists(select 1 from public.security_events where profile_id = auth.uid() and kind = 'mfa_removed'
      and created_at > now() - interval '10 minutes') then
    insert into public.security_events(profile_id, kind) values (auth.uid(), 'mfa_removed');
    perform public.notify(auth.uid(), 'system', 'Two-step sign-in was turned off',
      'If this was not you, change your password and turn it back on.', 'security', null);
  end if;
end;
$$;

-- Service role only: the mfa-recover function calls this, then removes the
-- authenticator through the Auth admin API. Five tries an hour.
create function public.consume_mfa_recovery_code(p_profile_id uuid, p_code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_used integer;
begin
  perform 1 from public.profiles where id = p_profile_id and deleted_at is null for update;
  if not found then raise exception 'profile not found'; end if;
  if (select count(*) from public.mfa_recovery_attempts
      where profile_id = p_profile_id and attempted_at > now() - interval '1 hour') >= 5 then
    raise exception 'too_many_attempts';
  end if;
  update public.mfa_recovery_codes set used_at = now()
  where profile_id = p_profile_id and used_at is null and code_hash = private.recovery_hash(p_profile_id, p_code);
  get diagnostics v_used = row_count;
  if v_used = 0 then
    insert into public.mfa_recovery_attempts(profile_id) values (p_profile_id);
    return false;
  end if;
  delete from public.mfa_recovery_codes where profile_id = p_profile_id;
  delete from public.mfa_recovery_attempts where profile_id = p_profile_id;
  insert into public.security_events(profile_id, kind) values (p_profile_id, 'mfa_recovered');
  perform public.notify(p_profile_id, 'system', 'A recovery code was used',
    'Two-step sign-in was turned off with a recovery code. Turn it back on from Settings, and change your password if this was not you.',
    'security', null);
  return true;
end;
$$;

revoke all on function public.create_mfa_recovery_codes() from public, anon;
revoke all on function public.record_mfa_removed() from public, anon;
revoke all on function public.consume_mfa_recovery_code(uuid, text) from public, anon, authenticated;
grant execute on function public.create_mfa_recovery_codes() to authenticated;
grant execute on function public.record_mfa_removed() to authenticated;
grant execute on function public.consume_mfa_recovery_code(uuid, text) to service_role;

-- The API hook, now with the second step. An account that has an
-- authenticator gets nothing from the API until the session has passed it:
-- reads as well as writes, because a stolen password must not open the
-- wallet or the messages. Signing in and completing the challenge go through
-- Supabase Auth, which this hook does not touch.
create or replace function public.check_request()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_method text := coalesce(current_setting('request.method', true), '');
  v_path text := coalesce(current_setting('request.path', true), '');
begin
  if auth.uid() is null then return; end if;
  if private.session_aal() <> 'aal2' and private.has_verified_factor(auth.uid()) then
    raise exception 'mfa_required';
  end if;
  if v_method in ('GET', 'HEAD', 'OPTIONS') then return; end if;
  if v_path in ('/rpc/get_my_profile', '/rpc/wallet_summary', '/rpc/is_admin', '/rpc/staff_can', '/rpc/chat_inbox',
      '/rpc/mark_notification_read', '/rpc/record_sign_in', '/support_requests') then
    return;
  end if;
  if exists(select 1 from public.profiles where id = auth.uid() and suspended_at is not null) then
    raise exception 'account_suspended';
  end if;
end;
$$;

-- Money leaves an account only on a session that passed the second step,
-- whether or not the hook is installed.
create or replace function private.locked_balance(p_profile_id uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_balance bigint;
begin
  if auth.uid() is not null then
    if exists(select 1 from public.profiles where id = auth.uid() and suspended_at is not null) then
      raise exception 'account_suspended';
    end if;
    if private.session_aal() <> 'aal2' and private.has_verified_factor(auth.uid()) then
      raise exception 'mfa_required';
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('wallet:' || p_profile_id::text, 0));
  select balance into v_balance from public.wallet_summary(p_profile_id);
  return coalesce(v_balance, 0);
end;
$$;
