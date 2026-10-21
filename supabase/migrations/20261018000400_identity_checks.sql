-- PRD Identity Verification: BVN, NIN, CAC, face and SIM checks against the
-- national registers, through Dojah, and their results passed to the fraud
-- rules ("Connected to Fraud Detection Engine").
--
-- When someone sends their ID, the identity-check Edge Function asks Dojah:
--   nin / bvn  is the number on the register, and is it this person's name?
--   face       does the selfie match the register's photo for that number?
--   sim        is the account's phone number registered to the same person?
--              (Nigerian SIMs are linked to a NIN, so the names must agree.)
--   cac        is the business registered and active, under this name?
-- Each answer is kept here. When every required check matches, the account
-- is verified on the spot, exactly as a reviewer approving it would. Anything
-- else goes to staff as before, with the answers beside the documents, and a
-- mismatch also raises a risk alert. Nothing is ever rejected automatically.
--
-- Only what a reviewer needs is kept: the outcome, a match score, and the
-- name the register holds. Never the register's photo, date of birth or the
-- rest of the record.

create table public.identity_checks (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  subject_type text not null check (subject_type in ('verification', 'business_verification')),
  subject_id uuid not null,
  kind text not null check (kind in ('nin', 'bvn', 'cac', 'face', 'sim')),
  provider text not null default 'dojah',
  outcome text not null check (outcome in ('match', 'mismatch', 'not_found', 'error')),
  confidence numeric(5, 2) check (confidence is null or confidence between 0 and 100),
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index identity_checks_subject on public.identity_checks(subject_type, subject_id, created_at);
alter table public.identity_checks enable row level security;
revoke all on public.identity_checks from anon, authenticated;
grant select on public.identity_checks to authenticated;
create policy "Owner and verification staff read identity checks" on public.identity_checks for select to authenticated
  using (profile_id = auth.uid() or public.staff_can('verification'));

-- The person a submission belongs to, and whether it is still waiting.
create function private.identity_subject(p_subject_type text, p_subject_id uuid)
returns table (profile_id uuid, status text) language sql stable security definer set search_path = public as $$
  select profile_id, status from public.verifications where p_subject_type = 'verification' and id = p_subject_id
  union all
  select profile_id, status from public.business_verifications where p_subject_type = 'business_verification' and id = p_subject_id;
$$;
revoke all on function private.identity_subject(text, uuid) from public, anon, authenticated;

-- Service role only, from identity-check: one answer from the register.
create function public.record_identity_check(
  p_subject_type text, p_subject_id uuid, p_kind text, p_outcome text, p_confidence numeric, p_detail jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare v_profile uuid; v_label text;
begin
  select profile_id into v_profile from private.identity_subject(p_subject_type, p_subject_id);
  if v_profile is null then raise exception 'verification not found'; end if;
  insert into public.identity_checks(profile_id, subject_type, subject_id, kind, outcome, confidence, detail)
  values (v_profile, p_subject_type, p_subject_id, p_kind, p_outcome, p_confidence, coalesce(p_detail, '{}'));

  v_label := case p_kind when 'nin' then 'NIN' when 'bvn' then 'BVN' when 'cac' then 'CAC registration'
    when 'face' then 'Selfie' else 'Phone number' end;
  if p_outcome = 'mismatch' then
    perform private.raise_risk(v_profile, 'identity_' || p_kind || '_mismatch',
      case when p_kind = 'face' then 'high' else 'medium' end,
      case p_kind
        when 'face' then 'The selfie does not match the photo on the national register for this ID.'
        when 'sim' then 'The phone number is registered to someone else.'
        else v_label || ' is registered under a different name.' end,
      jsonb_build_object('confidence', p_confidence) || coalesce(p_detail, '{}'), p_subject_type, p_subject_id::text);
  elsif p_outcome = 'not_found' and p_kind in ('nin', 'bvn', 'cac') then
    perform private.raise_risk(v_profile, 'identity_not_found', 'medium',
      v_label || ' was not found on the register.', coalesce(p_detail, '{}'), p_subject_type, p_subject_id::text);
  end if;
end;
$$;

-- Service role only: after the checks, approve when every required one
-- matched, or leave the submission with staff. Returns 'approved',
-- 'referred', or the status it already had.
--   ID:       the number (NIN or BVN) and the face must match; the phone,
--             when checked, must not belong to someone else; and no other
--             verified account may hold the same number.
--   Business: the CAC registration must match and be active.
create function public.complete_identity_review(p_subject_type text, p_subject_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_row public.verifications;
  v_biz public.business_verifications;
  v_outcomes jsonb;
  v_ok boolean;
begin
  select coalesce(jsonb_object_agg(kind, outcome), '{}') into v_outcomes from (
    select distinct on (kind) kind, outcome from public.identity_checks
    where subject_type = p_subject_type and subject_id = p_subject_id order by kind, created_at desc
  ) latest;

  if p_subject_type = 'verification' then
    select * into v_row from public.verifications where id = p_subject_id for update;
    if v_row.id is null then raise exception 'verification not found'; end if;
    if v_row.status <> 'pending' then return v_row.status; end if;
    if exists(select 1 from public.verifications other
        where other.id_type = v_row.id_type and other.id_number = v_row.id_number
          and other.profile_id <> v_row.profile_id and other.status = 'approved') then
      perform private.raise_risk(v_row.profile_id, 'duplicate_identity', 'high',
        'This ' || upper(v_row.id_type) || ' is already verified on another account.',
        jsonb_build_object('id_type', v_row.id_type), 'verification', v_row.id::text);
      return 'referred';
    end if;
    -- A check that never ran is not a match: coalesce, or a missing one would read as null and pass.
    v_ok := coalesce(v_row.id_type in ('nin', 'bvn')
      and v_outcomes->>v_row.id_type = 'match'
      and v_outcomes->>'face' = 'match'
      and coalesce(v_outcomes->>'sim', 'match') <> 'mismatch', false);
    if not v_ok then return 'referred'; end if;
    update public.verifications
    set status = 'approved', note = 'Checked automatically against the national register', reviewed_at = now()
    where id = v_row.id;
    update public.profiles set verified_at = now() where id = v_row.profile_id;
    update public.provider_profiles set verified = true where id = v_row.profile_id;
    perform public.notify(v_row.profile_id, 'system', 'You are verified',
      'Your ID and selfie matched the national register. You can now use every FindWork service.', 'verification', v_row.id::text);
    return 'approved';
  end if;

  select * into v_biz from public.business_verifications where id = p_subject_id for update;
  if v_biz.id is null then raise exception 'verification not found'; end if;
  if v_biz.status <> 'pending' then return v_biz.status; end if;
  if v_outcomes->>'cac' is distinct from 'match' then return 'referred'; end if;
  update public.business_verifications
  set status = 'approved', note = 'Checked automatically against the CAC register', reviewed_at = now()
  where id = v_biz.id;
  update public.profiles set business_verified_at = now() where id = v_biz.profile_id;
  perform public.notify(v_biz.profile_id, 'system', 'Your business is verified',
    v_biz.business_name || ' matched the CAC register and now shows as a verified business.', 'verification', null);
  return 'approved';
end;
$$;

-- What identity-check needs for one submission. The caller is checked by
-- the function: the owner, once; verification staff, again.
create function public.identity_check_subject(p_subject_type text, p_subject_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case p_subject_type
    when 'verification' then (
      select jsonb_build_object('profile_id', v.profile_id, 'status', v.status, 'id_type', v.id_type, 'id_number', v.id_number,
        'selfie_path', v.selfie_path, 'first_name', p.first_name, 'last_name', p.last_name, 'full_name', p.full_name, 'phone', p.phone,
        'checked', exists(select 1 from public.identity_checks c where c.subject_type = 'verification' and c.subject_id = v.id))
      from public.verifications v join public.profiles p on p.id = v.profile_id where v.id = p_subject_id)
    else (
      select jsonb_build_object('profile_id', b.profile_id, 'status', b.status, 'rc_number', b.rc_number, 'business_name', b.business_name,
        'checked', exists(select 1 from public.identity_checks c where c.subject_type = 'business_verification' and c.subject_id = b.id))
      from public.business_verifications b where b.id = p_subject_id)
  end;
$$;

revoke all on function public.record_identity_check(text, uuid, text, text, numeric, jsonb) from public, anon, authenticated;
revoke all on function public.complete_identity_review(text, uuid) from public, anon, authenticated;
revoke all on function public.identity_check_subject(text, uuid) from public, anon, authenticated;
grant execute on function public.record_identity_check(text, uuid, text, text, numeric, jsonb) to service_role;
grant execute on function public.complete_identity_review(text, uuid) to service_role;
grant execute on function public.identity_check_subject(text, uuid) to service_role;
