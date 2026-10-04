-- PRD User Management, and the security plumbing other features report into:
-- staff roles, account suspension, sign-in and device history, an audit trail
-- of staff actions, and the risk-alert queue.

-- ---------------------------------------------------------------------------
-- 1. Staff roles
-- ---------------------------------------------------------------------------

-- is_admin stays, and now simply means staff_role = 'admin'. The narrower
-- roles reach only the parts of the console their work needs.
alter table public.profiles
  add column staff_role text check (staff_role in ('admin', 'moderator', 'finance', 'support')),
  add column suspended_at timestamptz,
  add column suspended_reason text check (suspended_reason is null or char_length(suspended_reason) <= 500);
update public.profiles set staff_role = 'admin' where is_admin;
-- Suspension is public the way deletion is: listings and policies depend on it.
grant select (staff_role, suspended_at) on public.profiles to authenticated;

create function private.sync_admin_flag()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.is_admin and new.staff_role is null then new.staff_role := 'admin'; end if;
  elsif new.is_admin is distinct from old.is_admin and new.staff_role is not distinct from old.staff_role then
    new.staff_role := case when new.is_admin then 'admin' else null end;
  end if;
  new.is_admin := coalesce(new.staff_role = 'admin', false);
  return new;
end;
$$;
create trigger profiles_sync_admin_flag before insert or update of is_admin, staff_role on public.profiles
  for each row execute function private.sync_admin_flag();

-- A deleted or suspended account keeps its flag, so the check reads both.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select staff_role = 'admin' from public.profiles
    where id = auth.uid() and deleted_at is null and suspended_at is null), false);
$$;

create function public.staff_can(p_area text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select case staff_role
      when 'admin' then true
      when 'moderator' then p_area in ('console', 'lookup', 'disputes', 'moderation', 'verification', 'users', 'risk')
      when 'finance' then p_area in ('console', 'lookup', 'finance', 'analytics', 'risk')
      when 'support' then p_area in ('console', 'lookup', 'support', 'orders')
      else false end
    from public.profiles where id = auth.uid() and deleted_at is null and suspended_at is null), false);
$$;
revoke all on function public.staff_can(text) from public, anon;
grant execute on function public.staff_can(text) to authenticated;

-- Point each existing operator function at its area. Rewriting the stored
-- definition keeps every other line of those functions exactly as reviewed;
-- the loop fails loudly if a function no longer contains the gate.
do $$
declare r record; v_def text; v_new text;
begin
  for r in select * from (values
    ('resolve_dispute', 'disputes'), ('respond_to_dispute', 'disputes'),
    ('admin_resolve_report', 'moderation'),
    ('admin_review_verification', 'verification'), ('admin_set_provider_verified', 'verification'),
    ('admin_adjust_balance', 'finance'), ('admin_process_withdrawal', 'finance'),
    ('admin_mark_topup_refunded', 'finance'), ('admin_analytics', 'analytics'),
    ('admin_reply_support', 'support'), ('admin_set_order_status', 'orders'),
    ('admin_find_profiles', 'lookup')
  ) as t(fn, area) loop
    select pg_get_functiondef(p.oid) into strict v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = r.fn;
    v_new := replace(v_def, 'public.is_admin()', format('public.staff_can(%L)', r.area));
    if v_new = v_def then raise exception 'no admin gate found in %', r.fn; end if;
    execute v_new;
  end loop;
end;
$$;

-- The read side of the same areas. The existing admin policies stay.
create policy "Dispute staff read disputes" on public.disputes for select to authenticated using (public.staff_can('disputes'));
create policy "Dispute staff read responses" on public.dispute_responses for select to authenticated using (public.staff_can('disputes'));
create policy "Dispute staff read bookings" on public.bookings for select to authenticated using (public.staff_can('disputes'));
create policy "Dispute and order staff read orders" on public.orders for select to authenticated
  using (public.staff_can('disputes') or public.staff_can('orders'));
create policy "Dispute and order staff read order items" on public.order_items for select to authenticated
  using (public.staff_can('disputes') or public.staff_can('orders'));
create policy "Dispute staff read evidence" on storage.objects for select to authenticated
  using (bucket_id = 'dispute-evidence' and public.staff_can('disputes'));
create policy "Moderators read reports" on public.reports for select to authenticated using (public.staff_can('moderation'));
create policy "Verification staff read verifications" on public.verifications for select to authenticated using (public.staff_can('verification'));
create policy "Verification staff read documents" on storage.objects for select to authenticated
  using (bucket_id = 'verification-documents' and public.staff_can('verification'));
create policy "Finance staff read withdrawals" on public.withdrawals for select to authenticated using (public.staff_can('finance'));
create policy "Finance staff read payment intents" on public.payment_intents for select to authenticated using (public.staff_can('finance'));
create policy "Finance staff read payout accounts" on public.payout_accounts for select to authenticated using (public.staff_can('finance'));
create policy "Finance staff read the ledger" on public.wallet_transactions for select to authenticated using (public.staff_can('finance'));
create policy "Support staff read support requests" on public.support_requests for select to authenticated using (public.staff_can('support'));

create function private.notify_staff(p_area text, p_kind text, p_title text, p_body text, p_ref_type text, p_ref_id text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (profile_id, kind, title, body, ref_type, ref_id)
  select id, p_kind, p_title, p_body, p_ref_type, p_ref_id
  from public.profiles
  where deleted_at is null and suspended_at is null and (
    staff_role = 'admin'
    or (staff_role = 'moderator' and p_area in ('disputes', 'moderation', 'verification', 'users', 'risk'))
    or (staff_role = 'finance' and p_area in ('finance', 'analytics', 'risk'))
    or (staff_role = 'support' and p_area in ('support', 'orders')));
$$;
revoke all on function private.notify_staff(text, text, text, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Audit trail, sign-in history and the risk queue
-- ---------------------------------------------------------------------------

create table public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id),
  action text not null,
  target_id uuid references public.profiles(id),
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index admin_actions_target on public.admin_actions(target_id, created_at desc);
alter table public.admin_actions enable row level security;
revoke all on public.admin_actions from anon, authenticated;
grant select on public.admin_actions to authenticated;
create policy "User staff read the audit trail" on public.admin_actions for select to authenticated using (public.staff_can('users'));

create table public.devices (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  device_id text not null check (char_length(device_id) between 8 and 100),
  label text not null default '' check (char_length(label) <= 200),
  last_ip text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (profile_id, device_id)
);
create index devices_by_device on public.devices(device_id);
alter table public.devices enable row level security;
revoke all on public.devices from anon, authenticated;
grant select on public.devices to authenticated;
create policy "Owner and user staff read devices" on public.devices for select to authenticated
  using (profile_id = auth.uid() or public.staff_can('users') or public.staff_can('risk'));

create table public.security_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('sign_in', 'new_device', 'mfa_enrolled', 'mfa_removed', 'mfa_recovered',
    'suspended', 'reinstated', 'role_changed', 'sos')),
  device_id text,
  ip text,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index security_events_owner on public.security_events(profile_id, created_at desc);
alter table public.security_events enable row level security;
revoke all on public.security_events from anon, authenticated;
grant select on public.security_events to authenticated;
create policy "Owner and user staff read security events" on public.security_events for select to authenticated
  using (profile_id = auth.uid() or public.staff_can('users') or public.staff_can('risk'));

create table public.risk_alerts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  severity text not null check (severity in ('low', 'medium', 'high')),
  summary text not null,
  detail jsonb not null default '{}',
  ref_type text,
  ref_id text,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);
-- One open alert per subject, rule and reference: a rule that keeps firing
-- must not bury the queue.
create unique index risk_alerts_one_open on public.risk_alerts(profile_id, kind, coalesce(ref_id, '')) where status = 'open';
create index risk_alerts_queue on public.risk_alerts(status, created_at desc);
alter table public.risk_alerts enable row level security;
revoke all on public.risk_alerts from anon, authenticated;
grant select on public.risk_alerts to authenticated;
create policy "Risk staff read alerts" on public.risk_alerts for select to authenticated using (public.staff_can('risk'));

create function private.raise_risk(
  p_profile_id uuid, p_kind text, p_severity text, p_summary text,
  p_detail jsonb default '{}', p_ref_type text default null, p_ref_id text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_new integer;
begin
  insert into public.risk_alerts(profile_id, kind, severity, summary, detail, ref_type, ref_id)
  values (p_profile_id, p_kind, p_severity, p_summary, coalesce(p_detail, '{}'), p_ref_type, p_ref_id)
  on conflict do nothing;
  get diagnostics v_new = row_count;
  if v_new = 1 and p_severity = 'high' then
    perform private.notify_staff('risk', 'system', 'High-risk activity flagged', p_summary, 'risk', null);
  end if;
end;
$$;
revoke all on function private.raise_risk(uuid, text, text, text, jsonb, text, text) from public, anon, authenticated;

create function public.admin_review_risk_alert(p_alert_id uuid, p_status text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.staff_can('risk') then raise exception 'admins only'; end if;
  if p_status is null or p_status not in ('reviewed', 'dismissed') then raise exception 'invalid status'; end if;
  update public.risk_alerts
  set status = p_status, reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(trim(p_note), '')
  where id = p_alert_id and status = 'open';
  if not found then raise exception 'alert already reviewed'; end if;
end;
$$;
revoke all on function public.admin_review_risk_alert(uuid, text, text) from public, anon;
grant execute on function public.admin_review_risk_alert(uuid, text, text) to authenticated;

-- Called by the app after signing in. The device id is a random value the
-- browser keeps; it identifies an installation, not a person.
create function public.record_sign_in(p_device_id text, p_label text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ip text := split_part(coalesce(nullif(current_setting('request.headers', true), '')::json->>'x-forwarded-for', ''), ',', 1);
  v_known boolean;
  v_others integer;
  v_recent integer;
  v_sharers integer;
begin
  perform 1 from public.profiles where id = auth.uid() and deleted_at is null for update;
  if not found then raise exception 'not authenticated'; end if;
  if p_device_id is null or char_length(p_device_id) not between 8 and 100 then raise exception 'invalid device'; end if;

  select exists(select 1 from public.devices where profile_id = auth.uid() and device_id = p_device_id) into v_known;
  select count(*) into v_others from public.devices where profile_id = auth.uid() and device_id <> p_device_id;

  insert into public.devices(profile_id, device_id, label, last_ip)
  values (auth.uid(), p_device_id, left(coalesce(p_label, ''), 200), nullif(v_ip, ''))
  on conflict (profile_id, device_id) do update
    set last_seen_at = now(), label = excluded.label, last_ip = coalesce(excluded.last_ip, public.devices.last_ip);

  if v_known then
    -- The app calls this whenever a session is restored; one entry a day is enough.
    if not exists(select 1 from public.security_events where profile_id = auth.uid() and device_id = p_device_id
        and kind in ('sign_in', 'new_device') and created_at > now() - interval '12 hours') then
      insert into public.security_events(profile_id, kind, device_id, ip) values (auth.uid(), 'sign_in', p_device_id, nullif(v_ip, ''));
    end if;
    return jsonb_build_object('new_device', false);
  end if;

  insert into public.security_events(profile_id, kind, device_id, ip, detail)
  values (auth.uid(), 'new_device', p_device_id, nullif(v_ip, ''), jsonb_build_object('label', left(coalesce(p_label, ''), 200)));
  if v_others > 0 then
    perform public.notify(auth.uid(), 'system', 'New sign-in to your account',
      coalesce(nullif(left(p_label, 120), ''), 'A new device') || ' just signed in. If this was not you, change your password now.',
      'security', null);
  end if;

  select count(*) into v_recent from public.security_events
  where profile_id = auth.uid() and kind = 'new_device' and created_at > now() - interval '24 hours';
  if v_recent >= 3 then
    perform private.raise_risk(auth.uid(), 'many_new_devices', 'high',
      v_recent || ' new devices signed in to this account within 24 hours.', jsonb_build_object('devices', v_recent));
  end if;
  select count(distinct profile_id) into v_sharers from public.devices where device_id = p_device_id;
  if v_sharers >= 3 then
    perform private.raise_risk(auth.uid(), 'shared_device', 'medium',
      'This device has signed in to ' || v_sharers || ' accounts.', jsonb_build_object('accounts', v_sharers), 'device', p_device_id);
  end if;
  return jsonb_build_object('new_device', v_others > 0);
end;
$$;
revoke all on function public.record_sign_in(text, text) from public, anon;
grant execute on function public.record_sign_in(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Suspension
-- ---------------------------------------------------------------------------

create function public.admin_suspend_user(p_profile_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_target public.profiles; v_reason text := trim(coalesce(p_reason, ''));
begin
  if not public.staff_can('users') then raise exception 'admins only'; end if;
  if p_profile_id = auth.uid() then raise exception 'cannot change your own account'; end if;
  if char_length(v_reason) not between 3 and 500 then raise exception 'suspension reason required'; end if;
  select * into v_target from public.profiles where id = p_profile_id for update;
  if v_target.id is null or v_target.deleted_at is not null then raise exception 'profile not found'; end if;
  -- Only a full admin may act on another member of staff.
  if v_target.staff_role is not null and not public.is_admin() then raise exception 'admins only'; end if;
  if v_target.suspended_at is not null then return; end if;
  update public.profiles set suspended_at = now(), suspended_reason = v_reason where id = p_profile_id;
  insert into public.admin_actions(actor_id, action, target_id, detail) values (auth.uid(), 'suspend', p_profile_id, jsonb_build_object('reason', v_reason));
  insert into public.security_events(profile_id, kind, detail) values (p_profile_id, 'suspended', jsonb_build_object('reason', v_reason));
  perform public.notify(p_profile_id, 'system', 'Your account is suspended', v_reason, 'support', null);
end;
$$;

create function public.admin_reinstate_user(p_profile_id uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_target public.profiles;
begin
  if not public.staff_can('users') then raise exception 'admins only'; end if;
  select * into v_target from public.profiles where id = p_profile_id for update;
  if v_target.id is null then raise exception 'profile not found'; end if;
  if v_target.staff_role is not null and not public.is_admin() then raise exception 'admins only'; end if;
  if v_target.suspended_at is null then return; end if;
  update public.profiles set suspended_at = null, suspended_reason = null where id = p_profile_id;
  insert into public.admin_actions(actor_id, action, target_id, detail)
  values (auth.uid(), 'reinstate', p_profile_id, jsonb_build_object('note', nullif(trim(p_note), '')));
  insert into public.security_events(profile_id, kind) values (p_profile_id, 'reinstated');
  perform public.notify(p_profile_id, 'system', 'Your account is active again', coalesce(nullif(trim(p_note), ''), 'You can use FindWork as before.'), null, null);
end;
$$;

create function public.admin_set_staff_role(p_profile_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare v_target public.profiles;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  -- Nobody changes their own role, so there is always an admin left.
  if p_profile_id = auth.uid() then raise exception 'cannot change your own account'; end if;
  if p_role is not null and p_role not in ('admin', 'moderator', 'finance', 'support') then raise exception 'invalid role'; end if;
  select * into v_target from public.profiles where id = p_profile_id for update;
  if v_target.id is null or v_target.deleted_at is not null then raise exception 'profile not found'; end if;
  if v_target.staff_role is not distinct from p_role then return; end if;
  update public.profiles set staff_role = p_role where id = p_profile_id;
  insert into public.admin_actions(actor_id, action, target_id, detail)
  values (auth.uid(), 'set_role', p_profile_id, jsonb_build_object('from', v_target.staff_role, 'to', p_role));
  insert into public.security_events(profile_id, kind, detail) values (p_profile_id, 'role_changed', jsonb_build_object('role', p_role));
end;
$$;
revoke all on function public.admin_suspend_user(uuid, text) from public, anon;
revoke all on function public.admin_reinstate_user(uuid, text) from public, anon;
revoke all on function public.admin_set_staff_role(uuid, text) from public, anon;
grant execute on function public.admin_suspend_user(uuid, text) to authenticated;
grant execute on function public.admin_reinstate_user(uuid, text) to authenticated;
grant execute on function public.admin_set_staff_role(uuid, text) to authenticated;

-- A suspended account cannot spend, even if a request reaches the database
-- some other way than the API hook below.
create or replace function private.locked_balance(p_profile_id uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_balance bigint;
begin
  if auth.uid() is not null and exists(select 1 from public.profiles where id = auth.uid() and suspended_at is not null) then
    raise exception 'account_suspended';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('wallet:' || p_profile_id::text, 0));
  select balance into v_balance from public.wallet_summary(p_profile_id);
  return coalesce(v_balance, 0);
end;
$$;

-- Nothing new may be started by, or with, a suspended account. The columns
-- to check are the trigger's arguments.
create function private.block_suspended()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_col text; v_id uuid;
begin
  foreach v_col in array tg_argv loop
    execute format('select ($1).%I', v_col) into v_id using new;
    if v_id is not null and exists(select 1 from public.profiles where id = v_id and suspended_at is not null) then
      raise exception '%', case when v_id = auth.uid() then 'account_suspended' else 'counterparty_suspended' end;
    end if;
  end loop;
  return new;
end;
$$;
create trigger bookings_block_suspended before insert on public.bookings for each row execute function private.block_suspended('customer_id', 'provider_id');
create trigger orders_block_suspended before insert on public.orders for each row execute function private.block_suspended('customer_id', 'seller_id');
create trigger sent_quotes_block_suspended before insert on public.sent_quotes for each row execute function private.block_suspended('provider_id');
create trigger job_posts_block_suspended before insert on public.job_posts for each row execute function private.block_suspended('customer_id');
create trigger rfqs_block_suspended before insert on public.rfqs for each row execute function private.block_suspended('buyer_id');
create trigger rfq_quotes_block_suspended before insert on public.rfq_quotes for each row execute function private.block_suspended('supplier_id');
create trigger classifieds_block_suspended before insert on public.classifieds for each row execute function private.block_suspended('seller_id');
create trigger products_block_suspended before insert on public.products for each row execute function private.block_suspended('seller_id');
create trigger chat_messages_block_suspended before insert on public.chat_messages for each row execute function private.block_suspended('sender_id');
create trigger reviews_block_suspended before insert on public.reviews for each row execute function private.block_suspended('reviewer_id');

-- And what a suspended account already listed drops out of sight for
-- everyone but its owner and staff.
create function public.is_suspended(p_profile_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = p_profile_id and suspended_at is not null);
$$;
revoke all on function public.is_suspended(uuid) from public, anon;
grant execute on function public.is_suspended(uuid) to authenticated;

create policy "Suspended providers are hidden" on public.provider_profiles as restrictive for select to authenticated
  using (id = auth.uid() or public.staff_can('console') or not public.is_suspended(id));
create policy "Suspended sellers' products are hidden" on public.products as restrictive for select to authenticated
  using (seller_id is null or seller_id = auth.uid() or public.staff_can('console') or not public.is_suspended(seller_id));
create policy "Suspended sellers' listings are hidden" on public.classifieds as restrictive for select to authenticated
  using (seller_id = auth.uid() or public.staff_can('console') or not public.is_suspended(seller_id));

-- PostgREST runs this before every API request. A suspended account can
-- still read what it could before, mark notifications read and write to
-- support; every other write is refused.
create function public.check_request()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_method text := coalesce(current_setting('request.method', true), '');
  v_path text := coalesce(current_setting('request.path', true), '');
begin
  if auth.uid() is null or v_method in ('GET', 'HEAD', 'OPTIONS') then return; end if;
  if v_path in ('/rpc/get_my_profile', '/rpc/wallet_summary', '/rpc/is_admin', '/rpc/staff_can', '/rpc/chat_inbox',
      '/rpc/mark_notification_read', '/rpc/record_sign_in', '/support_requests') then
    return;
  end if;
  if exists(select 1 from public.profiles where id = auth.uid() and suspended_at is not null) then
    raise exception 'account_suspended';
  end if;
end;
$$;
revoke all on function public.check_request() from public;
grant execute on function public.check_request() to anon, authenticated;

-- Hosted projects have the authenticator role; a plain Postgres does not.
-- The hook must be confirmed on the hosted project: a notice here is not
-- proof that PostgREST picked it up.
do $$
begin
  if exists(select 1 from pg_roles where rolname = 'authenticator') then
    begin
      alter role authenticator set pgrst.db_pre_request = 'public.check_request';
      notify pgrst, 'reload config';
    exception when insufficient_privilege then
      raise notice 'Run as a superuser: alter role authenticator set pgrst.db_pre_request = ''public.check_request'';';
    end;
  else
    raise notice 'No authenticator role: public.check_request() is not installed as the API pre-request hook.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. One account at a glance, for staff
-- ---------------------------------------------------------------------------

create function public.admin_user_overview(p_profile_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_profile public.profiles; v_wallet record;
begin
  if not public.staff_can('lookup') then raise exception 'admins only'; end if;
  select * into v_profile from public.profiles where id = p_profile_id;
  if v_profile.id is null then raise exception 'profile not found'; end if;
  select * into v_wallet from public.wallet_summary(p_profile_id);
  return jsonb_build_object(
    'id', v_profile.id, 'full_name', v_profile.full_name, 'email', v_profile.email, 'phone', v_profile.phone,
    'created_at', v_profile.created_at, 'deleted_at', v_profile.deleted_at, 'verified_at', v_profile.verified_at,
    'staff_role', v_profile.staff_role, 'suspended_at', v_profile.suspended_at, 'suspended_reason', v_profile.suspended_reason,
    'is_provider', exists(select 1 from public.provider_profiles where id = p_profile_id),
    -- Money is for the people who handle money.
    'balance', case when public.staff_can('finance') or public.staff_can('users') then v_wallet.balance end,
    'escrow_held', case when public.staff_can('finance') or public.staff_can('users') then v_wallet.escrow_held end,
    'bookings', (select count(*) from public.bookings where p_profile_id in (customer_id, provider_id)),
    'orders', (select count(*) from public.orders where p_profile_id in (customer_id, seller_id)),
    'disputes_raised', (select count(*) from public.disputes where raised_by = p_profile_id),
    'disputes_against', (select count(*) from public.disputes where against_id = p_profile_id),
    'disputes_lost', (select count(*) from public.disputes where against_id = p_profile_id and outcome = 'refund'),
    'reports_against', (select count(*) from public.reports where target_type = 'profile' and target_id = p_profile_id::text),
    'open_alerts', (select count(*) from public.risk_alerts where profile_id = p_profile_id and status = 'open'),
    'devices', coalesce((select jsonb_agg(jsonb_build_object('label', d.label, 'last_seen_at', d.last_seen_at, 'last_ip', d.last_ip) order by d.last_seen_at desc)
      from (select * from public.devices where profile_id = p_profile_id order by last_seen_at desc limit 10) d), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'created_at', e.created_at, 'detail', e.detail) order by e.created_at desc)
      from (select * from public.security_events where profile_id = p_profile_id order by created_at desc limit 20) e), '[]'::jsonb),
    'actions', coalesce((select jsonb_agg(jsonb_build_object('action', a.action, 'created_at', a.created_at, 'detail', a.detail) order by a.created_at desc)
      from (select * from public.admin_actions where target_id = p_profile_id order by created_at desc limit 20) a), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.admin_user_overview(uuid) from public, anon;
grant execute on function public.admin_user_overview(uuid) to authenticated;
