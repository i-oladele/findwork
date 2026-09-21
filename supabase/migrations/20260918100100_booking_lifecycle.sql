-- The booking lifecycle, end to end, with the money rules enforced here.
--
-- Before this, pay_booking took the price from the client (anyone could
-- book an ₦28,500 service for ₦1), a booking skipped straight to 'active'
-- with no way for the provider to accept or decline, nothing could be
-- cancelled or refunded, and a customer could not act on a quote they were
-- sent. Plans promised lower fees that were never charged differently.
--
--   pending   — paid into escrow, waiting for the provider
--   active    — provider accepted
--   done      — customer released escrow; provider paid less commission
--   cancelled — declined or cancelled; customer refunded in full

-- ---------------------------------------------------------------------------
-- Plans carry the commission and listing limit they advertise
-- ---------------------------------------------------------------------------

alter table public.subscription_plans
  add column commission_rate numeric(4, 3) not null default 0.06,
  add column listing_limit integer,
  add column priority integer not null default 0;

alter table public.subscriptions add column renews_at timestamptz;

-- Denormalised from the provider's subscription so search can rank by it and
-- listings can show a Pro badge: subscriptions itself is private to its owner.
alter table public.provider_profiles
  add column plan text not null default 'free',
  add column priority integer not null default 0;

create index provider_profiles_rank_idx on public.provider_profiles (priority desc, rating desc);

create function private.commission_rate(p_provider_id uuid)
returns numeric
language sql
stable
security definer set search_path = public
as $$
  select coalesce(
    (select sp.commission_rate
     from public.subscriptions s
     join public.subscription_plans sp on sp.id = s.plan
     where s.profile_id = p_provider_id),
    (select commission_rate from public.subscription_plans where id = 'free'),
    0.06
  );
$$;

-- ---------------------------------------------------------------------------
-- Packages: duration for slot clashes, and the plan's listing limit
-- ---------------------------------------------------------------------------

alter table public.provider_packages
  add column duration_minutes integer not null default 60 check (duration_minutes between 15 and 1440);

create function private.enforce_listing_limit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_limit integer;
  v_live integer;
begin
  if new.status <> 'live' then
    return new;
  end if;

  select sp.listing_limit into v_limit
  from public.subscription_plans sp
  where sp.id = coalesce(
    (select plan from public.subscriptions where profile_id = new.provider_id),
    'free'
  );

  if v_limit is null then
    return new;
  end if;

  select count(*) into v_live
  from public.provider_packages
  where provider_id = new.provider_id and status = 'live' and id <> new.id;

  if v_live >= v_limit then
    raise exception 'listing_limit_reached';
  end if;
  return new;
end;
$$;

create trigger provider_packages_listing_limit
  before insert or update of status on public.provider_packages
  for each row execute procedure private.enforce_listing_limit();

-- A new provider starts with the default weekly availability, so booking
-- checks never have to guess what a missing row means.
create function private.create_default_availability()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.provider_availability (provider_id) values (new.id)
  on conflict (provider_id) do nothing;
  return new;
end;
$$;

create trigger provider_profiles_default_availability
  after insert on public.provider_profiles
  for each row execute procedure private.create_default_availability();

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------

alter table public.bookings
  add column package_id uuid references public.provider_packages (id) on delete set null,
  -- The provider's commission, fixed when escrow is released.
  add column commission integer not null default 0,
  add column cancelled_by uuid references public.profiles (id),
  add column cancelled_at timestamptz;

create index bookings_provider_idx on public.bookings (provider_id, start_at);
create index bookings_customer_idx on public.bookings (customer_id, start_at);

create function private.open_dispute_exists(p_ref_type text, p_ref_id text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.disputes
    where ref_type = p_ref_type and ref_id = p_ref_id and status = 'open'
  );
$$;

-- Returns the customer's escrow to their balance and closes the booking.
create function private.refund_booking(p_booking public.bookings, p_by uuid, p_label text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.bookings
  set status = 'cancelled', cancelled_by = p_by, cancelled_at = now()
  where id = p_booking.id;

  insert into public.wallet_transactions (profile_id, label, kind, balance_delta, escrow_delta, booking_id)
  values (p_booking.customer_id, p_label, 'refund', p_booking.escrow_held, -p_booking.escrow_held, p_booking.id);
end;
$$;

-- Releases escrow: the customer's hold clears, the provider is paid the job
-- price, and the provider's plan commission is taken as a separate, visible
-- ledger row. The customer's service fee was already taken at booking.
create function private.release_booking(p_booking public.bookings)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_rate numeric := private.commission_rate(p_booking.provider_id);
  v_commission integer := round(p_booking.price * v_rate);
begin
  update public.bookings
  set status = 'done', commission = v_commission
  where id = p_booking.id;

  insert into public.wallet_transactions (profile_id, label, kind, escrow_delta, booking_id)
  values (p_booking.customer_id, 'Released to ' || p_booking.provider_name, 'release', -p_booking.escrow_held, p_booking.id);

  insert into public.wallet_transactions (profile_id, label, kind, balance_delta, booking_id)
  values (p_booking.provider_id, 'Payout · ' || p_booking.service, 'release', p_booking.price, p_booking.id);

  if v_commission > 0 then
    insert into public.wallet_transactions (profile_id, label, kind, balance_delta, booking_id)
    values (p_booking.provider_id, 'FindWork fee · ' || round(v_rate * 100) || '%', 'fee', -v_commission, p_booking.id);
  end if;

  update public.provider_profiles set jobs_done = jobs_done + 1 where id = p_booking.provider_id;

  perform public.notify(p_booking.provider_id, 'payment', 'You have been paid',
    p_booking.service || ' · ₦' || to_char(p_booking.price - v_commission, 'FM999,999,999'),
    'wallet', p_booking.id::text);
end;
$$;

-- Shared by pay_booking and accept_job_quote: every rule about *when* a
-- provider can be booked, and the escrow debit itself.
create function private.create_booking(
  p_provider_id uuid,
  p_package_id uuid,
  p_service text,
  p_price integer,
  p_start_at timestamptz,
  p_duration_minutes integer,
  p_status text
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_provider public.provider_profiles;
  v_available boolean;
  v_fee integer;
  v_total integer;
  v_booking_id uuid;
begin
  if p_price <= 0 then
    raise exception 'price must be positive';
  end if;
  if p_start_at < now() then
    raise exception 'cannot book a time in the past';
  end if;
  if p_start_at > now() + interval '90 days' then
    raise exception 'too far ahead';
  end if;

  select * into v_provider from public.provider_profiles where id = p_provider_id;
  if v_provider is null or exists (
    select 1 from public.profiles where id = p_provider_id and deleted_at is not null
  ) then
    raise exception 'provider not found';
  end if;
  if not v_provider.taking_bookings then
    raise exception 'provider is not taking bookings';
  end if;
  if p_provider_id = auth.uid() then
    raise exception 'cannot book yourself';
  end if;

  -- Days are judged in Lagos time: 23:30 UTC on a Sunday is Monday in Lagos.
  select case extract(isodow from p_start_at at time zone 'Africa/Lagos')::int
           when 1 then monday when 2 then tuesday when 3 then wednesday
           when 4 then thursday when 5 then friday when 6 then saturday
           else sunday
         end
  into v_available
  from public.provider_availability where provider_id = p_provider_id;

  if not coalesce(v_available, true) then
    raise exception 'provider is closed that day';
  end if;

  v_fee := round(p_price * 0.05);
  v_total := p_price + v_fee;

  if private.locked_balance(auth.uid()) < v_total then
    raise exception 'insufficient_balance';
  end if;

  -- Raises 23P01 if the slot overlaps another pending/active booking.
  insert into public.bookings (
    provider_id, provider_name, customer_id, package_id, service, price, fee,
    start_at, duration_minutes, status, escrow_held
  )
  values (
    p_provider_id, v_provider.business_name, auth.uid(), p_package_id, p_service, p_price, v_fee,
    p_start_at, p_duration_minutes, p_status, v_total
  )
  returning id into v_booking_id;

  insert into public.wallet_transactions (profile_id, label, kind, balance_delta, escrow_delta, booking_id)
  values (auth.uid(), 'Escrow · ' || v_provider.business_name, 'escrow', -v_total, v_total, v_booking_id);

  return v_booking_id;
end;
$$;

-- The price is read from the package (or the provider's base price when they
-- have not set up packages), never taken from the client.
drop function public.pay_booking(uuid, text, integer, timestamptz, integer);

create function public.pay_booking(p_provider_id uuid, p_package_id uuid, p_start_at timestamptz)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_package public.provider_packages;
  v_service text;
  v_price integer;
  v_minutes integer := 60;
  v_booking_id uuid;
begin
  if p_package_id is not null then
    select * into v_package from public.provider_packages
    where id = p_package_id and provider_id = p_provider_id;
    if v_package is null then
      raise exception 'package not found';
    end if;
    if v_package.status <> 'live' then
      raise exception 'package is paused';
    end if;
    v_service := v_package.name;
    v_price := v_package.price;
    v_minutes := v_package.duration_minutes;
  else
    select category || ' service', price into v_service, v_price
    from public.provider_profiles where id = p_provider_id;
  end if;

  v_booking_id := private.create_booking(
    p_provider_id, p_package_id, v_service, v_price, p_start_at, v_minutes, 'pending'
  );

  perform public.notify(p_provider_id, 'booking', 'New booking request',
    v_service || ' · ' || to_char(p_start_at at time zone 'Africa/Lagos', 'Dy DD Mon, HH24:MI'),
    'booking_request', v_booking_id::text);

  return v_booking_id;
end;
$$;

-- Provider accepts or declines a pending booking. Declining refunds in full.
create function public.respond_to_booking(p_booking_id uuid, p_accept boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_booking public.bookings;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking is null then
    raise exception 'booking not found';
  end if;
  if v_booking.provider_id <> auth.uid() then
    raise exception 'not your booking';
  end if;
  if v_booking.status <> 'pending' then
    raise exception 'booking already answered';
  end if;

  if p_accept then
    update public.bookings set status = 'active' where id = p_booking_id;
    perform public.notify(v_booking.customer_id, 'booking', v_booking.provider_name || ' accepted your booking',
      v_booking.service, 'booking', p_booking_id::text);
  else
    perform private.refund_booking(v_booking, auth.uid(), 'Refund · ' || v_booking.provider_name || ' declined');
    perform public.notify(v_booking.customer_id, 'booking', v_booking.provider_name || ' declined your booking',
      'Your ₦' || to_char(v_booking.escrow_held, 'FM999,999,999') || ' is back in your wallet.',
      'booking', p_booking_id::text);
  end if;
end;
$$;

-- Either side can cancel before the job starts; the customer is refunded in
-- full. Once it has started, a problem is a dispute, not a cancellation.
create function public.cancel_booking(p_booking_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_booking public.bookings;
  v_other uuid;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking is null then
    raise exception 'booking not found';
  end if;
  if auth.uid() not in (v_booking.customer_id, v_booking.provider_id) then
    raise exception 'not your booking';
  end if;
  if v_booking.status not in ('pending', 'active') then
    raise exception 'booking cannot be cancelled';
  end if;
  if v_booking.start_at <= now() then
    raise exception 'booking already started';
  end if;
  if private.open_dispute_exists('booking', p_booking_id::text) then
    raise exception 'dispute_open';
  end if;

  perform private.refund_booking(v_booking, auth.uid(), 'Refund · ' || v_booking.service);

  v_other := case when auth.uid() = v_booking.customer_id then v_booking.provider_id else v_booking.customer_id end;
  perform public.notify(v_other, 'booking', 'Booking cancelled',
    v_booking.service || ' on ' || to_char(v_booking.start_at at time zone 'Africa/Lagos', 'Dy DD Mon'),
    case when v_other = v_booking.provider_id then 'booking_request' else 'booking' end,
    p_booking_id::text);
end;
$$;

-- Customer confirms the work is done: escrow is released to the provider.
create or replace function public.complete_booking(p_booking_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_booking public.bookings;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking is null then
    raise exception 'booking not found';
  end if;
  if v_booking.customer_id <> auth.uid() then
    raise exception 'not your booking';
  end if;
  if v_booking.status = 'done' then
    return;
  end if;
  if v_booking.status <> 'active' then
    raise exception 'booking is not active';
  end if;
  if private.open_dispute_exists('booking', p_booking_id::text) then
    raise exception 'dispute_open';
  end if;

  perform private.release_booking(v_booking);
end;
$$;

-- Which slots a provider already has taken. Customers cannot read other
-- customers' bookings, so the time picker gets only the ranges.
create function public.provider_busy_slots(p_provider_id uuid, p_from timestamptz, p_to timestamptz)
returns table (start_at timestamptz, end_at timestamptz)
language sql
stable
security definer set search_path = public
as $$
  select lower(slot_range), upper(slot_range)
  from public.bookings
  where provider_id = p_provider_id
    and status in ('pending', 'active')
    and slot_range && tstzrange(p_from, p_to, '[)');
$$;

-- The old request table was never written to by anything; booking requests
-- are now simply pending bookings.
drop function public.respond_to_request(uuid, boolean);
drop table public.provider_requests;

-- ---------------------------------------------------------------------------
-- Posted jobs and quotes
-- ---------------------------------------------------------------------------

alter table public.job_posts add column quote_count integer not null default 0;

alter table public.sent_quotes
  add column status text not null default 'sent' check (status in ('sent', 'accepted', 'declined')),
  add constraint sent_quotes_one_per_provider unique (job_id, provider_id),
  add constraint sent_quotes_price_positive check (price > 0),
  add constraint sent_quotes_days_positive check (days > 0);

alter table public.job_posts add constraint job_posts_budget_positive check (budget > 0);

-- The owner can edit or close their own job.
create policy "A customer can update their own job"
  on public.job_posts for update
  to authenticated
  using (customer_id = auth.uid())
  with check (customer_id = auth.uid());

revoke update on public.job_posts from anon, authenticated;
grant update (title, description, budget, needed_by, status) on public.job_posts to authenticated;

-- Only providers can quote (a booking needs a provider profile to point at),
-- and not on their own job or a closed one.
drop policy "A provider can send a quote" on public.sent_quotes;

create policy "A provider can quote on someone else's open job"
  on public.sent_quotes for insert
  to authenticated
  with check (
    provider_id = auth.uid()
    and exists (select 1 from public.provider_profiles where id = auth.uid())
    and exists (
      select 1 from public.job_posts jp
      where jp.id = sent_quotes.job_id and jp.status = 'open' and jp.customer_id <> auth.uid()
    )
  );

revoke insert on public.sent_quotes from anon, authenticated;
grant insert (job_id, provider_id, price, days, start_day, message) on public.sent_quotes to authenticated;

create function private.on_quote_sent()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_job public.job_posts;
  v_provider text;
begin
  update public.job_posts set quote_count = quote_count + 1 where id = new.job_id
  returning * into v_job;
  select business_name into v_provider from public.provider_profiles where id = new.provider_id;

  perform public.notify(v_job.customer_id, 'quote', 'New quote on ' || v_job.title,
    coalesce(v_provider, 'A provider') || ' · ₦' || to_char(new.price, 'FM999,999,999'),
    'job', new.job_id::text);
  return new;
end;
$$;

create trigger sent_quotes_after_insert
  after insert on public.sent_quotes
  for each row execute procedure private.on_quote_sent();

-- Accepting a quote books the provider at the quoted price, pays escrow, and
-- closes the job. The provider already offered, so it starts 'active'.
create function public.accept_job_quote(p_quote_id uuid, p_start_at timestamptz)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_quote public.sent_quotes;
  v_job public.job_posts;
  v_booking_id uuid;
begin
  select * into v_quote from public.sent_quotes where id = p_quote_id for update;
  if v_quote is null then
    raise exception 'quote not found';
  end if;
  select * into v_job from public.job_posts where id = v_quote.job_id for update;
  if v_job.customer_id <> auth.uid() then
    raise exception 'not your job';
  end if;
  if v_job.status <> 'open' then
    raise exception 'job is closed';
  end if;

  v_booking_id := private.create_booking(
    v_quote.provider_id, null, v_job.title, v_quote.price, p_start_at, 60, 'active'
  );

  update public.sent_quotes set status = 'accepted' where id = p_quote_id;
  update public.sent_quotes set status = 'declined' where job_id = v_job.id and id <> p_quote_id;
  update public.job_posts set status = 'closed' where id = v_job.id;

  perform public.notify(v_quote.provider_id, 'quote', 'Your quote was accepted',
    v_job.title || ' · ₦' || to_char(v_quote.price, 'FM999,999,999') || ' is in escrow',
    'booking_request', v_booking_id::text);

  return v_booking_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reviews tell the provider
-- ---------------------------------------------------------------------------

create function private.on_review_left()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.notify(new.provider_id, 'review', 'New ' || new.rating || '-star review',
    left(new.body, 140), 'provider', new.provider_id::text);
  return new;
end;
$$;

create trigger reviews_after_insert
  after insert on public.reviews
  for each row execute procedure private.on_review_left();

-- ---------------------------------------------------------------------------
-- Subscriptions: plan side effects and monthly renewal
-- ---------------------------------------------------------------------------

create or replace function public.subscribe_plan(p_plan text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_plan public.subscription_plans;
  v_current text;
begin
  select * into v_plan from public.subscription_plans where id = p_plan;
  if v_plan is null then
    raise exception 'plan not found';
  end if;

  select plan into v_current from public.subscriptions where profile_id = auth.uid();
  if v_current = p_plan then
    return;
  end if;

  if v_plan.price > 0 then
    if private.locked_balance(auth.uid()) < v_plan.price then
      raise exception 'insufficient_balance';
    end if;
    insert into public.wallet_transactions (profile_id, label, kind, balance_delta)
    values (auth.uid(), v_plan.name || ' plan · 1 month', 'subscription', -v_plan.price);
  end if;

  insert into public.subscriptions (profile_id, plan, since, renews_at)
  values (auth.uid(), p_plan, now(), case when v_plan.price > 0 then now() + interval '1 month' end)
  on conflict (profile_id) do update
    set plan = excluded.plan, since = excluded.since, renews_at = excluded.renews_at;

  update public.provider_profiles
  set plan = v_plan.id, priority = v_plan.priority
  where id = auth.uid();
end;
$$;

-- Charges each paid plan that is due, or drops it to Free if the wallet
-- cannot cover it. Scheduled daily below where pg_cron is available.
create function private.renew_subscriptions()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_sub record;
  v_count integer := 0;
begin
  for v_sub in
    select s.profile_id, sp.id as plan_id, sp.name, sp.price
    from public.subscriptions s
    join public.subscription_plans sp on sp.id = s.plan
    where sp.price > 0 and s.renews_at <= now()
    for update of s
  loop
    if private.locked_balance(v_sub.profile_id) >= v_sub.price then
      insert into public.wallet_transactions (profile_id, label, kind, balance_delta)
      values (v_sub.profile_id, v_sub.name || ' plan · 1 month', 'subscription', -v_sub.price);
      update public.subscriptions set renews_at = renews_at + interval '1 month' where profile_id = v_sub.profile_id;
      perform public.notify(v_sub.profile_id, 'payment', v_sub.name || ' plan renewed',
        '₦' || to_char(v_sub.price, 'FM999,999,999') || ' taken from your wallet.', 'billing', null);
    else
      update public.subscriptions set plan = 'free', since = now(), renews_at = null where profile_id = v_sub.profile_id;
      update public.provider_profiles set plan = 'free', priority = 0 where id = v_sub.profile_id;
      perform public.notify(v_sub.profile_id, 'payment', 'Moved to the Free plan',
        'Your wallet could not cover the ' || v_sub.name || ' renewal. Top up and switch back any time.', 'billing', null);
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Scheduling is best-effort: pg_cron is not installable everywhere (and on
-- some hosts only into a particular schema). A failure here must not stop
-- the migration — renewals can be driven by any scheduler, and nothing else
-- depends on it. Check the notice after pushing; if it says pg_cron was not
-- scheduled, enable it from the Supabase dashboard (Database → Extensions)
-- and run the cron.schedule line below by hand.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('renew-subscriptions', '15 6 * * *', 'select private.renew_subscriptions()');
    raise notice 'pg_cron: subscription renewals scheduled daily at 06:15';
  else
    raise notice 'pg_cron not available; run private.renew_subscriptions() on a schedule another way';
  end if;
exception when others then
  raise notice 'pg_cron not scheduled (%): run private.renew_subscriptions() on a schedule another way', sqlerrm;
end;
$$;
