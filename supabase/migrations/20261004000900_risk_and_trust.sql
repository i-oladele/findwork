-- PRD Trust Score System, Transaction Monitoring, AI Fraud Detection and the
-- verification tiers that gate payments.
--
-- The checks here are fixed, explainable rules, not a trained model. Each
-- alert says which rule fired and why. A rule only ever raises an alert for
-- a person to review; none of them moves money or closes an account.

-- ---------------------------------------------------------------------------
-- 1. Verification tiers and the limits they carry
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column business_verified_at timestamptz,
  add column verification_tier smallint not null default 0 check (verification_tier between 0 and 3),
  add column trust_score integer not null default 0 check (trust_score between 0 and 100);
grant select (verified_at, business_verified_at, verification_tier, trust_score) on public.profiles to authenticated;

create table public.platform_limits (
  tier smallint primary key check (tier between 0 and 3),
  label text not null,
  daily_withdrawal integer not null check (daily_withdrawal >= 0),
  daily_transfer integer not null check (daily_transfer >= 0)
);
insert into public.platform_limits(tier, label, daily_withdrawal, daily_transfer) values
  (0, 'Unconfirmed', 0, 0),
  (1, 'Contact confirmed', 50000, 50000),
  (2, 'ID verified', 2000000, 1000000),
  (3, 'Business verified', 10000000, 5000000);
alter table public.platform_limits enable row level security;
revoke all on public.platform_limits from anon, authenticated;
grant select on public.platform_limits to authenticated;
create policy "Limits are public" on public.platform_limits for select to authenticated using (true);

create function private.verification_tier(p_profile_id uuid)
returns smallint language sql stable security definer set search_path = public as $$
  select (case
    when p.business_verified_at is not null then 3
    when p.verified_at is not null then 2
    when u.email_confirmed_at is not null or u.phone_confirmed_at is not null then 1
    else 0 end)::smallint
  from public.profiles p left join auth.users u on u.id = p.id
  where p.id = p_profile_id;
$$;
revoke all on function private.verification_tier(uuid) from public, anon, authenticated;

create function private.lagos_day_start()
returns timestamptz language sql stable as $$
  select date_trunc('day', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos';
$$;

-- Business (CAC) verification: a registration number and the certificate,
-- reviewed by a person. Approval is the top tier.
create table public.business_verifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id),
  rc_number text not null check (rc_number ~ '^(RC|BN|IT|LP|LLP)?[0-9]{4,8}$'),
  business_name text not null check (char_length(trim(business_name)) between 2 and 160),
  document_path text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index business_verifications_one_pending on public.business_verifications(profile_id) where status = 'pending';
alter table public.business_verifications enable row level security;
revoke all on public.business_verifications from anon, authenticated;
grant select on public.business_verifications to authenticated;
create policy "Owner and verification staff read business checks" on public.business_verifications for select to authenticated
  using (profile_id = auth.uid() or public.staff_can('verification'));

create function public.submit_business_verification(p_rc_number text, p_business_name text, p_document_path text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles;
  v_number text := upper(regexp_replace(coalesce(p_rc_number, ''), '[^0-9A-Za-z]', '', 'g'));
  v_id uuid;
begin
  select * into v_profile from public.profiles where id = auth.uid() and deleted_at is null for update;
  if v_profile.id is null then raise exception 'not authenticated'; end if;
  if v_profile.business_verified_at is not null then raise exception 'already_verified'; end if;
  if exists(select 1 from public.business_verifications where profile_id = auth.uid() and status = 'pending') then
    raise exception 'verification_pending';
  end if;
  if v_number !~ '^(RC|BN|IT|LP|LLP)?[0-9]{4,8}$' then raise exception 'invalid registration number'; end if;
  if char_length(trim(coalesce(p_business_name, ''))) not between 2 and 160 then raise exception 'invalid business name'; end if;
  if split_part(coalesce(p_document_path, ''), '/', 1) <> auth.uid()::text
     or not exists(select 1 from storage.objects where bucket_id = 'verification-documents' and name = p_document_path) then
    raise exception 'verification photos missing';
  end if;
  insert into public.business_verifications(profile_id, rc_number, business_name, document_path)
  values (auth.uid(), v_number, trim(p_business_name), p_document_path) returning id into v_id;
  perform private.notify_staff('verification', 'system', 'Business verification to review', trim(p_business_name), 'admin_verification', v_id::text);
  return v_id;
end;
$$;

create function public.admin_review_business_verification(p_verification_id uuid, p_approve boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_row public.business_verifications;
begin
  if not public.staff_can('verification') then raise exception 'admins only'; end if;
  select * into v_row from public.business_verifications where id = p_verification_id for update;
  if v_row.id is null then raise exception 'verification not found'; end if;
  if v_row.status <> 'pending' then raise exception 'verification already reviewed'; end if;
  if not coalesce(p_approve, false) and char_length(trim(coalesce(p_note, ''))) < 3 then raise exception 'rejection reason required'; end if;
  update public.business_verifications
  set status = case when p_approve then 'approved' else 'rejected' end, note = nullif(trim(p_note), ''),
      reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_verification_id;
  if p_approve then
    update public.profiles set business_verified_at = now() where id = v_row.profile_id;
  end if;
  insert into public.admin_actions(actor_id, action, target_id, detail)
  values (auth.uid(), case when p_approve then 'approve_business' else 'reject_business' end, v_row.profile_id,
    jsonb_build_object('rc_number', v_row.rc_number));
  perform public.notify(v_row.profile_id, 'system',
    case when p_approve then 'Your business is verified' else 'Business verification was not approved' end,
    case when p_approve then v_row.business_name || ' now shows as a verified business.' else coalesce(nullif(trim(p_note), ''), '') end,
    'verification', null);
end;
$$;
revoke all on function public.submit_business_verification(text, text, text) from public, anon;
revoke all on function public.admin_review_business_verification(uuid, boolean, text) from public, anon;
grant execute on function public.submit_business_verification(text, text, text) to authenticated;
grant execute on function public.admin_review_business_verification(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The trust score
-- ---------------------------------------------------------------------------

-- Four parts, 100 in all. Verification (30): what has been proven about who
-- this is. Reputation (30): what customers said and how much work was done.
-- History (20): how long the account has existed and how much it has
-- completed. Conduct (20): starts full, and loses points for disputes lost,
-- reports upheld and open risk alerts. A suspended account scores zero.
create function private.trust_breakdown(p_profile_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_profile public.profiles;
  v_provider public.provider_profiles;
  v_tier smallint;
  v_completed integer;
  v_verification integer; v_reputation integer; v_history integer; v_conduct integer;
begin
  select * into v_profile from public.profiles where id = p_profile_id;
  if v_profile.id is null then return null; end if;
  v_tier := private.verification_tier(p_profile_id);
  select * into v_provider from public.provider_profiles where id = p_profile_id;
  select (select count(*) from public.bookings where status = 'done' and p_profile_id in (customer_id, provider_id))
       + (select count(*) from public.orders where status = 'delivered' and p_profile_id in (customer_id, seller_id))
  into v_completed;

  v_verification := (array[0, 10, 25, 30])[v_tier + 1];
  if v_provider.id is not null then
    v_reputation := round(v_provider.rating / 5.0 * 20 * least(v_provider.reviews, 10) / 10.0)
      + round(least(v_provider.jobs_done, 20) / 20.0 * 10);
  else
    v_reputation := round(least(v_completed, 10) / 10.0 * 15);
  end if;
  v_history := round(least(extract(epoch from now() - v_profile.created_at) / 2629800.0, 12) / 12.0 * 10)
    + round(least(v_completed, 20) / 20.0 * 10);
  v_conduct := greatest(0, 20
    - 5 * (select count(*) from public.disputes where against_id = p_profile_id and outcome = 'refund')::integer
    - 3 * (select count(*) from public.reports where target_type = 'profile' and target_id = p_profile_id::text and status = 'actioned')::integer
    - 10 * (select count(*) from public.risk_alerts where profile_id = p_profile_id and status = 'open' and severity = 'high')::integer
    - 5 * (select count(*) from public.risk_alerts where profile_id = p_profile_id and status = 'open' and severity = 'medium')::integer);

  return jsonb_build_object(
    'tier', v_tier,
    'verification', v_verification, 'reputation', v_reputation, 'history', v_history, 'conduct', v_conduct,
    'score', case when v_profile.suspended_at is not null or v_profile.deleted_at is not null then 0
      else least(100, v_verification + v_reputation + v_history + v_conduct) end);
end;
$$;
revoke all on function private.trust_breakdown(uuid) from public, anon, authenticated;

-- The stored copy is what listings and profiles show; it is refreshed when
-- anything it depends on changes.
create function private.refresh_trust(p_profile_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if p_profile_id is null then return; end if;
  v := private.trust_breakdown(p_profile_id);
  if v is null then return; end if;
  update public.profiles set trust_score = (v->>'score')::integer, verification_tier = (v->>'tier')::smallint
  where id = p_profile_id and (trust_score, verification_tier) is distinct from ((v->>'score')::integer, (v->>'tier')::smallint);
  update public.provider_profiles set trust_score = (v->>'score')::integer
  where id = p_profile_id and trust_score is distinct from (v->>'score')::integer;
end;
$$;
revoke all on function private.refresh_trust(uuid) from public, anon, authenticated;

-- Your own breakdown, or anyone's for staff. Other people get the score and
-- tier only: the parts would reveal disputes and alerts that are not theirs
-- to see.
create function public.trust_score(p_profile_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  v := private.trust_breakdown(p_profile_id);
  if v is null then raise exception 'profile not found'; end if;
  if p_profile_id = auth.uid() or public.staff_can('lookup') then return v; end if;
  return jsonb_build_object('score', v->'score', 'tier', v->'tier');
end;
$$;
revoke all on function public.trust_score(uuid) from public, anon;
grant execute on function public.trust_score(uuid) to authenticated;

create function private.refresh_trust_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_col text; v_id uuid;
begin
  foreach v_col in array tg_argv loop
    execute format('select ($1).%I', v_col) into v_id using new;
    perform private.refresh_trust(v_id);
  end loop;
  return new;
end;
$$;
create trigger reviews_refresh_trust after insert or update on public.reviews for each row execute function private.refresh_trust_trigger('provider_id');
create trigger bookings_refresh_trust after update of status on public.bookings for each row execute function private.refresh_trust_trigger('customer_id', 'provider_id');
create trigger orders_refresh_trust after update of status on public.orders for each row execute function private.refresh_trust_trigger('customer_id', 'seller_id');
create trigger disputes_refresh_trust after update of status on public.disputes for each row execute function private.refresh_trust_trigger('raised_by', 'against_id');
create trigger risk_alerts_refresh_trust after insert or update on public.risk_alerts for each row execute function private.refresh_trust_trigger('profile_id');
create trigger devices_refresh_trust after insert or update on public.devices for each row execute function private.refresh_trust_trigger('profile_id');
create trigger profiles_refresh_trust after update of verified_at, business_verified_at, suspended_at on public.profiles
  for each row execute function private.refresh_trust_trigger('id');
create trigger provider_profiles_refresh_trust after insert on public.provider_profiles for each row execute function private.refresh_trust_trigger('id');

do $$
declare r record;
begin
  for r in select id from public.profiles loop perform private.refresh_trust(r.id); end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Limits on withdrawals
-- ---------------------------------------------------------------------------

create function private.guard_withdrawal()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_limit integer; v_today bigint;
begin
  select daily_withdrawal into v_limit from public.platform_limits where tier = private.verification_tier(new.profile_id);
  select coalesce(sum(amount), 0) into v_today from public.withdrawals
  where profile_id = new.profile_id and status <> 'rejected' and created_at >= private.lagos_day_start();
  if v_today + new.amount > coalesce(v_limit, 0) then raise exception 'verification_limit'; end if;
  if exists(select 1 from public.risk_alerts where profile_id = new.profile_id and status = 'open' and severity = 'high') then
    perform private.raise_risk(new.profile_id, 'withdrawal_while_flagged', 'high',
      'A withdrawal of ₦' || to_char(new.amount, 'FM999,999,999') || ' was requested while a high-risk alert is open.',
      jsonb_build_object('amount', new.amount), 'withdrawal', new.id::text);
  end if;
  return new;
end;
$$;
create trigger withdrawals_guard before insert on public.withdrawals for each row execute function private.guard_withdrawal();

create function public.my_limits()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_tier smallint := private.verification_tier(auth.uid()); v_limits public.platform_limits;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into v_limits from public.platform_limits where tier = coalesce(v_tier, 0);
  return jsonb_build_object(
    'tier', coalesce(v_tier, 0), 'label', v_limits.label,
    'daily_withdrawal', v_limits.daily_withdrawal, 'daily_transfer', v_limits.daily_transfer,
    'withdrawn_today', (select coalesce(sum(amount), 0) from public.withdrawals
      where profile_id = auth.uid() and status <> 'rejected' and created_at >= private.lagos_day_start()),
    'transferred_today', (select coalesce(-sum(balance_delta), 0) from public.wallet_transactions
      where profile_id = auth.uid() and kind = 'transfer' and balance_delta < 0 and created_at >= private.lagos_day_start()));
end;
$$;
revoke all on function public.my_limits() from public, anon;
grant execute on function public.my_limits() to authenticated;

-- A seller with an open high-risk alert is not paid automatically; the
-- customer's confirmation or a member of staff still can.
create or replace function private.auto_release_orders(p_days integer default 7)
returns integer language plpgsql security definer set search_path = public as $$
declare v_order public.orders; v_count integer := 0;
begin
  for v_order in
    select * from public.orders
    where status = 'dispatched'
      and seller_id is not null
      and dispatched_at < now() - make_interval(days => p_days)
      and not private.open_dispute_exists('order', id::text)
      and not exists(select 1 from public.risk_alerts r where r.profile_id = orders.seller_id and r.status = 'open' and r.severity = 'high')
    for update
  loop
    -- Recheck after taking the row lock: a dispute may have committed while
    -- this worker waited for it.
    if private.open_dispute_exists('order', v_order.id::text) then continue; end if;
    perform private.release_order(v_order);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Transaction scanning
-- ---------------------------------------------------------------------------

create index wallet_transactions_scan on public.wallet_transactions(profile_id, kind, created_at desc);

create function private.scan_transaction()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_amount bigint := abs(new.balance_delta);
  v_count integer;
  v_sum bigint;
  v_age interval;
begin
  -- Monitoring must never be the reason a payment fails.
  begin
    if new.kind = 'withdrawal' and new.balance_delta < 0 then
      if v_amount >= 500000 then
        perform private.raise_risk(new.profile_id, 'large_withdrawal', case when v_amount >= 2000000 then 'high' else 'medium' end,
          'Withdrawal of ₦' || to_char(v_amount, 'FM999,999,999') || '.', jsonb_build_object('amount', v_amount), 'transaction', new.id::text);
      end if;
      select count(*) into v_count from public.wallet_transactions
      where profile_id = new.profile_id and kind = 'withdrawal' and balance_delta < 0 and created_at > now() - interval '24 hours';
      if v_count >= 3 then
        perform private.raise_risk(new.profile_id, 'rapid_withdrawals', 'medium',
          v_count || ' withdrawals within 24 hours.', jsonb_build_object('count', v_count));
      end if;
      -- Money paid in by card and taken straight out, with nothing bought in
      -- between, is how a stolen card is turned into cash.
      select coalesce(sum(balance_delta), 0) into v_sum from public.wallet_transactions
      where profile_id = new.profile_id and kind = 'topup' and created_at > now() - interval '48 hours';
      if v_sum >= v_amount * 0.8 and v_amount >= 20000 and not exists(
        select 1 from public.wallet_transactions where profile_id = new.profile_id
          and kind in ('escrow', 'order', 'course', 'subscription') and created_at > now() - interval '48 hours') then
        perform private.raise_risk(new.profile_id, 'pass_through', 'high',
          '₦' || to_char(v_amount, 'FM999,999,999') || ' withdrawn within 48 hours of topping up, with nothing bought in between.',
          jsonb_build_object('amount', v_amount, 'topped_up', v_sum), 'transaction', new.id::text);
      end if;
    elsif new.kind = 'topup' then
      if v_amount >= 1000000 then
        perform private.raise_risk(new.profile_id, 'large_topup', 'medium',
          'Top-up of ₦' || to_char(v_amount, 'FM999,999,999') || '.', jsonb_build_object('amount', v_amount), 'transaction', new.id::text);
      end if;
      select count(*) into v_count from public.wallet_transactions
      where profile_id = new.profile_id and kind = 'topup' and created_at > now() - interval '1 hour';
      if v_count >= 5 then
        perform private.raise_risk(new.profile_id, 'rapid_topups', 'medium',
          v_count || ' top-ups within an hour.', jsonb_build_object('count', v_count));
      end if;
    elsif new.kind = 'refund' and new.balance_delta > 0 then
      select count(*) into v_count from public.wallet_transactions
      where profile_id = new.profile_id and kind = 'refund' and balance_delta > 0 and created_at > now() - interval '7 days';
      if v_count >= 3 then
        perform private.raise_risk(new.profile_id, 'repeat_refunds', 'medium',
          v_count || ' refunds within 7 days.', jsonb_build_object('count', v_count));
      end if;
    elsif new.kind = 'adjustment' and new.booking_id is null and new.order_id is null and v_amount >= 100000 then
      perform private.raise_risk(new.profile_id, 'large_adjustment', 'medium',
        'Manual adjustment of ₦' || to_char(v_amount, 'FM999,999,999') || ': ' || new.label,
        jsonb_build_object('amount', new.balance_delta), 'transaction', new.id::text);
    elsif new.kind = 'transfer' and new.balance_delta < 0 then
      select count(*) into v_count from public.wallet_transactions
      where profile_id = new.profile_id and kind = 'transfer' and balance_delta < 0 and created_at > now() - interval '1 hour';
      if v_count >= 5 then
        perform private.raise_risk(new.profile_id, 'rapid_transfers', 'medium',
          v_count || ' transfers sent within an hour.', jsonb_build_object('count', v_count));
      end if;
    end if;

    if new.balance_delta <= -200000 and new.kind in ('escrow', 'order', 'transfer', 'withdrawal') then
      select now() - created_at into v_age from public.profiles where id = new.profile_id;
      if v_age < interval '24 hours' then
        perform private.raise_risk(new.profile_id, 'new_account_large_spend', 'medium',
          'An account less than a day old moved ₦' || to_char(v_amount, 'FM999,999,999') || '.',
          jsonb_build_object('amount', v_amount, 'kind', new.kind), 'transaction', new.id::text);
      end if;
    end if;
  exception when others then
    raise warning 'transaction scan failed: %', sqlerrm;
  end;
  return new;
end;
$$;
create trigger wallet_transactions_scan after insert on public.wallet_transactions
  for each row execute function private.scan_transaction();

-- ---------------------------------------------------------------------------
-- 5. Listing and behaviour checks
-- ---------------------------------------------------------------------------

-- Arguments: owner column, title column, body column, reference type.
create function private.scan_listing()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb := to_jsonb(new);
  v_owner uuid := nullif(v_row->>tg_argv[0], '')::uuid;
  v_title text := coalesce(v_row->>tg_argv[1], '');
  v_body text := coalesce(v_row->>tg_argv[2], '');
  v_text text := lower(v_title || ' ' || v_body);
  v_ref text := v_row->>'id';
  v_copy boolean;
  v_median numeric; v_count integer;
begin
  if v_owner is null then return new; end if;
  begin
    -- Taking the deal off the platform removes escrow, and is how most
    -- marketplace fraud starts.
    if regexp_replace(v_text, '[\s\-\.\(\)]', '', 'g') ~ '(\+?234|0)[789][01][0-9]{8}'
       or v_text ~ '(whats\s?app|telegram|western union|gift\s?card|pay(ment)? (me )?(direct|outside)|https?://|www\.)' then
      perform private.raise_risk(v_owner, 'off_platform_contact', 'medium',
        'A listing asks buyers to make contact or pay outside FindWork: ' || left(v_title, 80),
        jsonb_build_object('table', tg_table_name), tg_argv[3], v_ref);
    end if;

    if char_length(v_body) >= 40 then
      execute format('select exists(select 1 from public.%I t where t.%I <> $1 and lower(t.%I) = lower($2) and lower(coalesce(t.%I, '''')) = lower($3))',
        tg_table_name, tg_argv[0], tg_argv[1], tg_argv[2]) into v_copy using v_owner, v_title, v_body;
      if v_copy then
        perform private.raise_risk(v_owner, 'duplicate_listing', 'high',
          'A listing copies another account''s listing word for word: ' || left(v_title, 80),
          jsonb_build_object('table', tg_table_name), tg_argv[3], v_ref);
      end if;
    end if;

    execute format('select count(*) from public.%I t where t.%I = $1', tg_table_name, tg_argv[0]) into v_count using v_owner;
    if v_count >= 5 and exists(select 1 from public.profiles where id = v_owner and created_at > now() - interval '24 hours') then
      perform private.raise_risk(v_owner, 'listing_burst', 'medium',
        'An account less than a day old has posted ' || v_count || ' listings.', jsonb_build_object('table', tg_table_name, 'count', v_count));
    end if;

    if tg_table_name = 'classifieds' then
      select percentile_cont(0.5) within group (order by price), count(*) into v_median, v_count
      from public.classifieds where category = (v_row->>'category') and id::text <> v_ref;
      if v_count >= 5 and (v_row->>'price')::numeric < v_median * 0.2 then
        perform private.raise_risk(v_owner, 'price_outlier', 'low',
          'Priced far below similar listings: ' || left(v_title, 80),
          jsonb_build_object('price', (v_row->>'price')::numeric, 'median', v_median), tg_argv[3], v_ref);
      end if;
    end if;
  exception when others then
    raise warning 'listing scan failed: %', sqlerrm;
  end;
  return new;
end;
$$;
create trigger classifieds_scan after insert or update of title, description, price on public.classifieds
  for each row execute function private.scan_listing('seller_id', 'title', 'description', 'classified');
create trigger products_scan after insert or update of name, description on public.products
  for each row execute function private.scan_listing('seller_id', 'name', 'description', 'product');
create trigger provider_packages_scan after insert or update of name, detail on public.provider_packages
  for each row execute function private.scan_listing('provider_id', 'name', 'detail', 'package');

create function private.scan_report()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_target uuid; v_count integer;
begin
  begin
    if new.target_type = 'profile' then
      v_target := new.target_id::uuid;
    elsif new.target_type = 'classified' then
      select seller_id into v_target from public.classifieds where id::text = new.target_id;
    elsif new.target_type = 'job' then
      select customer_id into v_target from public.job_posts where id::text = new.target_id;
    end if;
    if v_target is not null then
      select count(distinct reporter_id) into v_count from public.reports r
      where r.created_at > now() - interval '7 days' and r.status <> 'dismissed' and (
        (r.target_type = 'profile' and r.target_id = v_target::text)
        or (r.target_type = 'classified' and r.target_id in (select id::text from public.classifieds where seller_id = v_target))
        or (r.target_type = 'job' and r.target_id in (select id::text from public.job_posts where customer_id = v_target)));
      if v_count >= 3 then
        perform private.raise_risk(v_target, 'repeated_reports', 'medium',
          v_count || ' different people reported this account or its listings within 7 days.', jsonb_build_object('reporters', v_count));
      end if;
    end if;
  exception when others then
    raise warning 'report scan failed: %', sqlerrm;
  end;
  return new;
end;
$$;
create trigger reports_scan after insert on public.reports for each row execute function private.scan_report();

create function private.scan_dispute()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if new.against_id is null then return new; end if;
  begin
    select count(*) into v_count from public.disputes where against_id = new.against_id and opened_at > now() - interval '30 days';
    if v_count >= 3 then
      perform private.raise_risk(new.against_id, 'repeated_disputes', 'medium',
        v_count || ' disputes opened against this account within 30 days.', jsonb_build_object('disputes', v_count));
    end if;
  exception when others then
    raise warning 'dispute scan failed: %', sqlerrm;
  end;
  return new;
end;
$$;
create trigger disputes_scan after insert on public.disputes for each row execute function private.scan_dispute();

create index chat_messages_sender_recent on public.chat_messages(sender_id, created_at desc);
create function private.scan_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_threads integer;
begin
  begin
    select count(distinct thread_id) into v_threads from public.chat_messages
    where sender_id = new.sender_id and created_at > now() - interval '10 minutes';
    if v_threads >= 10 then
      perform private.raise_risk(new.sender_id, 'message_burst', 'medium',
        'Messaged ' || v_threads || ' different people within 10 minutes.', jsonb_build_object('threads', v_threads));
    end if;
  exception when others then
    raise warning 'message scan failed: %', sqlerrm;
  end;
  return new;
end;
$$;
create trigger chat_messages_scan after insert on public.chat_messages for each row execute function private.scan_message();
