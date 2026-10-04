-- PRD Wallet System: fund transfers. Roadmap phase 7: milestone escrow, so a
-- larger job can be paid for in agreed stages.

alter table public.wallet_transactions drop constraint wallet_transactions_kind_check;
alter table public.wallet_transactions add constraint wallet_transactions_kind_check
  check (kind in ('escrow', 'release', 'order', 'topup', 'fee', 'subscription', 'refund', 'course',
    'withdrawal', 'adjustment', 'transfer', 'delivery'));

-- ---------------------------------------------------------------------------
-- 1. Wallet-to-wallet transfers
-- ---------------------------------------------------------------------------

create table public.wallet_transfers (
  -- Chosen by the sender's device, so a retried request cannot send twice.
  id uuid primary key,
  sender_id uuid not null references public.profiles(id),
  recipient_id uuid not null references public.profiles(id),
  amount integer not null check (amount >= 100),
  note text check (note is null or char_length(note) <= 140),
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
create index wallet_transfers_sender on public.wallet_transfers(sender_id, created_at desc);
create index wallet_transfers_recipient on public.wallet_transfers(recipient_id, created_at desc);
alter table public.wallet_transfers enable row level security;
revoke all on public.wallet_transfers from anon, authenticated;
grant select on public.wallet_transfers to authenticated;
create policy "Both sides and finance staff read a transfer" on public.wallet_transfers for select to authenticated
  using (auth.uid() in (sender_id, recipient_id) or public.staff_can('finance'));
alter table public.wallet_transactions add column transfer_id uuid references public.wallet_transfers(id);

-- Finds one account by its exact phone number or email. A partial match
-- returns nothing: this is for paying someone you already know, not for
-- browsing who has an account.
create function public.find_transfer_recipient(p_contact text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_contact text := trim(coalesce(p_contact, ''));
  v_digits text := regexp_replace(v_contact, '[^0-9]', '', 'g');
  v_found public.profiles;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if position('@' in v_contact) > 0 then
    select * into v_found from public.profiles
    where lower(email) = lower(v_contact) and deleted_at is null and suspended_at is null limit 1;
  elsif char_length(v_digits) between 10 and 15 then
    -- 0803… and +234 803… are the same Nigerian number.
    if v_digits like '0%' and char_length(v_digits) = 11 then v_digits := '234' || substr(v_digits, 2); end if;
    select * into v_found from public.profiles
    where regexp_replace(phone, '[^0-9]', '', 'g') = v_digits and deleted_at is null and suspended_at is null limit 1;
  end if;
  if v_found.id is null or v_found.id = auth.uid() then return null; end if;
  return jsonb_build_object('id', v_found.id,
    -- Enough to confirm it is the right person without handing over a full name.
    'name', coalesce(nullif(trim(v_found.first_name || ' ' || left(v_found.last_name, 1)), ''), split_part(v_found.full_name, ' ', 1), 'FindWork user'),
    'verification_tier', v_found.verification_tier);
end;
$$;

create function public.transfer_funds(p_id uuid, p_recipient_id uuid, p_amount integer, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_existing public.wallet_transfers;
  v_sender public.profiles;
  v_recipient public.profiles;
  v_limit integer;
  v_today bigint;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_id is null or p_amount is null or p_amount < 100 then raise exception 'minimum transfer'; end if;
  if char_length(coalesce(v_note, '')) > 140 then raise exception 'transfer note too long'; end if;
  if p_recipient_id = auth.uid() then raise exception 'cannot send to yourself'; end if;
  select * into v_sender from public.profiles where id = auth.uid() and deleted_at is null;
  select * into v_recipient from public.profiles where id = p_recipient_id and deleted_at is null and suspended_at is null;
  if v_sender.id is null or v_recipient.id is null then raise exception 'recipient not found'; end if;

  -- Takes the sender's wallet lock; also refuses a suspended account and a
  -- session that still owes its second sign-in step.
  if private.locked_balance(auth.uid()) < p_amount then
    -- A retry of a transfer that already went through must not fail on the
    -- balance it has already spent.
    select * into v_existing from public.wallet_transfers where id = p_id;
    if v_existing.id is not null and v_existing.sender_id = auth.uid()
       and v_existing.recipient_id = p_recipient_id and v_existing.amount = p_amount then
      return v_existing.id;
    end if;
    raise exception 'insufficient_balance';
  end if;
  select * into v_existing from public.wallet_transfers where id = p_id;
  if v_existing.id is not null then
    if v_existing.sender_id = auth.uid() and v_existing.recipient_id = p_recipient_id and v_existing.amount = p_amount then
      return v_existing.id;
    end if;
    raise exception 'invalid transfer';
  end if;

  select daily_transfer into v_limit from public.platform_limits where tier = private.verification_tier(auth.uid());
  select coalesce(-sum(balance_delta), 0) into v_today from public.wallet_transactions
  where profile_id = auth.uid() and kind = 'transfer' and balance_delta < 0 and created_at >= private.lagos_day_start();
  if v_today + p_amount > coalesce(v_limit, 0) then raise exception 'verification_limit'; end if;

  insert into public.wallet_transfers(id, sender_id, recipient_id, amount, note) values (p_id, auth.uid(), p_recipient_id, p_amount, v_note);
  insert into public.wallet_transactions(profile_id, label, kind, balance_delta, transfer_id)
  values (auth.uid(), 'Sent to ' || coalesce(nullif(v_recipient.full_name, ''), 'FindWork user'), 'transfer', -p_amount, p_id);
  insert into public.wallet_transactions(profile_id, label, kind, balance_delta, transfer_id)
  values (p_recipient_id, 'Received from ' || coalesce(nullif(v_sender.full_name, ''), 'FindWork user'), 'transfer', p_amount, p_id);
  perform public.notify(p_recipient_id, 'payment', 'You received ₦' || to_char(p_amount, 'FM999,999,999'),
    coalesce(nullif(v_sender.full_name, ''), 'Someone') || ' sent you money' || coalesce(': ' || v_note, '.'), 'wallet', null);
  return p_id;
end;
$$;
revoke all on function public.find_transfer_recipient(text) from public, anon;
revoke all on function public.transfer_funds(uuid, uuid, integer, text) from public, anon;
grant execute on function public.find_transfer_recipient(text) to authenticated;
grant execute on function public.transfer_funds(uuid, uuid, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Milestone escrow
-- ---------------------------------------------------------------------------

-- A quote may split its price into two to six stages. The whole price is
-- still held when the customer accepts; each stage is released as the
-- customer approves it, and whatever is not released can still be refunded.
create function public.valid_milestones(p_milestones jsonb, p_price integer)
returns boolean language plpgsql immutable as $$
declare m jsonb; v_sum numeric := 0; v_amount numeric;
begin
  if p_milestones is null then return true; end if;
  if jsonb_typeof(p_milestones) <> 'array' or jsonb_array_length(p_milestones) not between 2 and 6 then return false; end if;
  for m in select * from jsonb_array_elements(p_milestones) loop
    if jsonb_typeof(m) <> 'object' or jsonb_typeof(m->'amount') <> 'number'
       or char_length(trim(coalesce(m->>'title', ''))) not between 1 and 80 then return false; end if;
    v_amount := (m->>'amount')::numeric;
    if v_amount <= 0 or v_amount <> trunc(v_amount) then return false; end if;
    v_sum := v_sum + v_amount;
  end loop;
  return v_sum = p_price;
end;
$$;
revoke all on function public.valid_milestones(jsonb, integer) from public, anon;
grant execute on function public.valid_milestones(jsonb, integer) to authenticated;

alter table public.sent_quotes
  add column milestones jsonb,
  add constraint sent_quotes_milestones_valid check (public.valid_milestones(milestones, price));
grant insert (milestones) on public.sent_quotes to authenticated;
alter table public.quote_revisions add column milestones jsonb;

create or replace function private.record_quote_revision()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.quote_revisions(quote_id, revision, price, days, start_day, message, status, milestones)
  values(new.id, new.revision, new.price, new.days, new.start_day, new.message, new.status, new.milestones);
  return new;
end;
$$;

alter table public.bookings
  add column released_amount integer not null default 0 check (released_amount >= 0),
  add column released_fee integer not null default 0 check (released_fee >= 0);
update public.bookings set released_amount = price, released_fee = fee where status = 'done';

create table public.booking_milestones (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  position smallint not null check (position > 0),
  title text not null,
  amount integer not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'released', 'refunded')),
  released_at timestamptz,
  unique (booking_id, position)
);
alter table public.booking_milestones enable row level security;
revoke all on public.booking_milestones from anon, authenticated;
grant select on public.booking_milestones to authenticated;
create policy "Booking participants and dispute staff read milestones" on public.booking_milestones for select to authenticated
  using (exists(select 1 from public.bookings b where b.id = booking_id and auth.uid() in (b.customer_id, b.provider_id))
    or public.staff_can('disputes'));

drop function public.revise_job_quote(uuid, integer, integer, integer, text, text);
create function public.revise_job_quote(p_quote_id uuid, p_expected_revision integer, p_price integer, p_days integer, p_start_day text, p_message text, p_milestones jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_quote public.sent_quotes; v_job public.job_posts;
begin
  v_quote := private.editable_quote(p_quote_id, p_expected_revision);
  if coalesce(char_length(p_message),0) > 2000 or coalesce(char_length(p_start_day),0) > 100 then raise exception 'quote text too long'; end if;
  if not public.valid_milestones(p_milestones, p_price) then raise exception 'invalid milestones'; end if;
  update public.sent_quotes set price = p_price, days = p_days, start_day = nullif(trim(p_start_day),''),
    message = nullif(trim(p_message),''), milestones = p_milestones, status = 'sent', revision = revision + 1 where id = p_quote_id;
  update public.job_posts set quote_count = (select count(*) from public.sent_quotes where job_id = v_quote.job_id and status <> 'withdrawn')
    where id = v_quote.job_id returning * into v_job;
  perform public.notify(v_job.customer_id, 'quote', 'A quote was updated', v_job.title || ' · review the latest terms before accepting.', 'job', v_job.id::text);
end;
$$;
revoke all on function public.revise_job_quote(uuid, integer, integer, integer, text, text, jsonb) from public, anon;
grant execute on function public.revise_job_quote(uuid, integer, integer, integer, text, text, jsonb) to authenticated;

create or replace function public.accept_job_quote(p_quote_id uuid, p_start_at timestamptz, p_expected_revision integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_quote public.sent_quotes; v_job public.job_posts; v_booking_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into v_quote from public.sent_quotes where id = p_quote_id;
  if v_quote.id is null then raise exception 'quote not found'; end if;
  select * into v_job from public.job_posts where id = v_quote.job_id for update;
  if v_job.customer_id <> auth.uid() then raise exception 'not your job'; end if;
  select * into v_quote from public.sent_quotes where id = p_quote_id for update;
  if v_job.status <> 'open' then raise exception 'job is closed'; end if;
  if v_quote.status <> 'sent' then raise exception 'quote unavailable'; end if;
  if p_expected_revision is distinct from v_quote.revision then raise exception 'quote_changed'; end if;
  v_booking_id := private.create_booking(v_quote.provider_id, null, v_job.title, v_quote.price, p_start_at, 60, 'active');
  if v_quote.milestones is not null then
    insert into public.booking_milestones(booking_id, position, title, amount)
    select v_booking_id, t.ord, trim(t.m->>'title'), (t.m->>'amount')::integer
    from jsonb_array_elements(v_quote.milestones) with ordinality as t(m, ord);
  end if;
  update public.sent_quotes set status = 'accepted', revision = revision + 1 where id = p_quote_id;
  update public.sent_quotes set status = 'declined', revision = revision + 1 where job_id = v_job.id and id <> p_quote_id and status = 'sent';
  update public.job_posts set status = 'closed' where id = v_job.id;
  perform public.notify(v_quote.provider_id, 'quote', 'Your quote was accepted',
    v_job.title || ' · ₦' || to_char(v_quote.price, 'FM999,999,999') || ' is in escrow', 'booking_request', v_booking_id::text);
  return v_booking_id;
end;
$$;

-- Releasing a booking now pays only what earlier milestones did not.
create or replace function private.release_booking(p_booking public.bookings)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_rate numeric := private.commission_rate(p_booking.provider_id);
  v_remaining integer;
  v_commission integer;
begin
  select * into p_booking from public.bookings where id = p_booking.id for update;
  if not found or p_booking.status not in ('active') then raise exception 'booking is closed'; end if;
  if private.open_dispute_exists('booking', p_booking.id::text) then raise exception 'dispute_open'; end if;
  v_remaining := p_booking.price - p_booking.released_amount;
  v_commission := round(v_remaining * v_rate);
  update public.bookings
  set status = 'done', commission = commission + v_commission, released_amount = price, released_fee = fee
  where id = p_booking.id;

  insert into public.wallet_transactions (profile_id, label, kind, escrow_delta, booking_id)
  values (p_booking.customer_id, 'Released to ' || p_booking.provider_name, 'release', -p_booking.escrow_held, p_booking.id);

  insert into public.wallet_transactions (profile_id, label, kind, balance_delta, booking_id)
  values (p_booking.provider_id, 'Payout · ' || p_booking.service, 'release', v_remaining, p_booking.id);

  if v_commission > 0 then
    insert into public.wallet_transactions (profile_id, label, kind, balance_delta, booking_id)
    values (p_booking.provider_id, 'FindWork fee · ' || round(v_rate * 100) || '%', 'fee', -v_commission, p_booking.id);
  end if;

  update public.provider_profiles set jobs_done = jobs_done + 1 where id = p_booking.provider_id;

  perform public.notify(p_booking.provider_id, 'payment', 'You have been paid',
    p_booking.service || ' · ₦' || to_char(v_remaining - v_commission, 'FM999,999,999'),
    'wallet', p_booking.id::text);
end;
$$;

-- Closing a booking settles its stages with it: paid if it completed,
-- refunded with the rest of the escrow if it was cancelled.
create function private.close_milestones()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'done' then
    update public.booking_milestones set status = 'released', released_at = now() where booking_id = new.id and status = 'pending';
  elsif new.status = 'cancelled' then
    update public.booking_milestones set status = 'refunded' where booking_id = new.id and status = 'pending';
  end if;
  return new;
end;
$$;
create trigger bookings_close_milestones after update of status on public.bookings
  for each row when (new.status in ('done', 'cancelled')) execute function private.close_milestones();

-- The customer approves the next stage. Stages are released in order; the
-- last one completes the booking.
create function public.release_milestone(p_milestone_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_milestone public.booking_milestones;
  v_booking public.bookings;
  v_rate numeric;
  v_commission integer;
  v_fee_share integer;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into v_milestone from public.booking_milestones where id = p_milestone_id;
  if v_milestone.id is null then raise exception 'milestone not found'; end if;
  select * into v_booking from public.bookings where id = v_milestone.booking_id for update;
  if v_booking.customer_id <> auth.uid() then raise exception 'not your booking'; end if;
  select * into v_milestone from public.booking_milestones where id = p_milestone_id for update;
  if v_booking.status <> 'active' then raise exception 'booking is not active'; end if;
  if v_milestone.status <> 'pending' then raise exception 'milestone already settled'; end if;
  if private.open_dispute_exists('booking', v_booking.id::text) then raise exception 'dispute_open'; end if;
  if exists(select 1 from public.booking_milestones
      where booking_id = v_booking.id and status = 'pending' and position < v_milestone.position) then
    raise exception 'release earlier milestones first';
  end if;

  if not exists(select 1 from public.booking_milestones
      where booking_id = v_booking.id and status = 'pending' and id <> p_milestone_id) then
    -- The last stage settles everything that is left, to the naira.
    perform private.release_booking(v_booking);
    return;
  end if;

  v_rate := private.commission_rate(v_booking.provider_id);
  v_commission := round(v_milestone.amount * v_rate);
  v_fee_share := round(v_booking.fee::numeric * v_milestone.amount / v_booking.price);
  update public.booking_milestones set status = 'released', released_at = now() where id = p_milestone_id;
  update public.bookings
  set escrow_held = escrow_held - (v_milestone.amount + v_fee_share),
      released_amount = released_amount + v_milestone.amount,
      released_fee = released_fee + v_fee_share,
      commission = commission + v_commission
  where id = v_booking.id;

  insert into public.wallet_transactions (profile_id, label, kind, escrow_delta, booking_id)
  values (v_booking.customer_id, 'Stage released to ' || v_booking.provider_name, 'release', -(v_milestone.amount + v_fee_share), v_booking.id);
  insert into public.wallet_transactions (profile_id, label, kind, balance_delta, booking_id)
  values (v_booking.provider_id, 'Stage payout · ' || v_milestone.title, 'release', v_milestone.amount, v_booking.id);
  if v_commission > 0 then
    insert into public.wallet_transactions (profile_id, label, kind, balance_delta, booking_id)
    values (v_booking.provider_id, 'FindWork fee · ' || round(v_rate * 100) || '%', 'fee', -v_commission, v_booking.id);
  end if;
  perform public.notify(v_booking.provider_id, 'payment', 'A stage was paid',
    v_milestone.title || ' · ₦' || to_char(v_milestone.amount - v_commission, 'FM999,999,999'), 'wallet', v_booking.id::text);
end;
$$;
revoke all on function public.release_milestone(uuid) from public, anon;
grant execute on function public.release_milestone(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Reporting follows the staged releases
-- ---------------------------------------------------------------------------

-- A booking's service fee is now earned in proportion to each release, so a
-- half-released job reports half its fee. Transfers move money between
-- customers and are not income.
create or replace function public.admin_analytics(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_result jsonb;
begin
  if not public.staff_can('analytics') then raise exception 'admins only'; end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '366 days' then
    raise exception 'invalid report range';
  end if;
  with ledger as (
    select w.*, b.fee as booking_fee, b.price as booking_price, o.commission as order_commission, o.seller_id, o.items_total
    from public.wallet_transactions w
    left join public.bookings b on b.id = w.booking_id
    left join public.orders o on o.id = w.order_id
    where w.created_at >= p_from and w.created_at < p_to
  ), income as (
    select created_at,
      case
        when kind = 'fee' then -balance_delta::numeric
        when kind = 'release' and booking_id is not null and escrow_delta < 0
          then -escrow_delta::numeric * coalesce(booking_fee, 0) / nullif(booking_price + booking_fee, 0)
        when kind = 'refund' and order_id is not null and seller_id is not null then -coalesce(order_commission,0)::numeric
        else 0 end as marketplace_fees,
      case when kind = 'subscription' then -balance_delta::bigint else 0 end as subscriptions,
      case when kind = 'course' then -balance_delta::bigint else 0 end as courses,
      case when order_id is not null and seller_id is null then
        case when kind = 'order' then items_total::bigint when kind = 'refund' then -items_total::bigint else 0 end
        else 0 end as catalog_collections
    from ledger
  ), activity as (
    select customer_id as profile_id from public.bookings where created_at >= p_from and created_at < p_to
    union select provider_id from public.bookings where created_at >= p_from and created_at < p_to
    union select customer_id from public.orders where placed_at >= p_from and placed_at < p_to
    union select seller_id from public.orders where placed_at >= p_from and placed_at < p_to and seller_id is not null
    union select sender_id from public.chat_messages where created_at >= p_from and created_at < p_to
    union select profile_id from ledger
    union select provider_id from public.sent_quotes where created_at >= p_from and created_at < p_to
  ), dates as (
    select day::date as day from generate_series(
      (p_from at time zone 'Africa/Lagos')::date::timestamp,
      ((p_to - interval '1 microsecond') at time zone 'Africa/Lagos')::date::timestamp,
      interval '1 day') day
  ), daily_income as (
    select (created_at at time zone 'Africa/Lagos')::date as day,
      round(sum(marketplace_fees))::bigint as marketplace_fees, sum(subscriptions) as subscriptions,
      sum(courses) as courses, sum(catalog_collections) as catalog_collections
    from income group by 1
  ), daily_signups as (
    select (created_at at time zone 'Africa/Lagos')::date as day, count(*) as signups
    from public.profiles where created_at >= p_from and created_at < p_to group by 1
  ), daily_bookings as (
    select (created_at at time zone 'Africa/Lagos')::date as day, count(*) as bookings
    from public.bookings where created_at >= p_from and created_at < p_to group by 1
  ), daily_orders as (
    select (placed_at at time zone 'Africa/Lagos')::date as day, count(*) as orders
    from public.orders where placed_at >= p_from and placed_at < p_to group by 1
  )
  select jsonb_build_object(
    'as_of', now(), 'from', p_from, 'to', p_to,
    'period', jsonb_build_object(
      'marketplace_fees', coalesce((select round(sum(marketplace_fees))::bigint from income),0),
      'subscriptions', coalesce((select sum(subscriptions) from income),0),
      'courses', coalesce((select sum(courses) from income),0),
      'catalog_collections', coalesce((select sum(catalog_collections) from income),0),
      'signups', (select count(*) from public.profiles where created_at >= p_from and created_at < p_to),
      'active_users', (select count(*) from activity),
      'bookings', (select count(*) from public.bookings where created_at >= p_from and created_at < p_to),
      'orders', (select count(*) from public.orders where placed_at >= p_from and placed_at < p_to),
      'messages', (select count(*) from public.chat_messages where created_at >= p_from and created_at < p_to),
      'ledger_entries', (select count(*) from ledger),
      'topups', coalesce((select sum(balance_delta) from ledger where kind = 'topup'),0),
      'customer_refunds', coalesce((select sum(balance_delta) from ledger where kind = 'refund'),0),
      'transfers', coalesce((select sum(balance_delta) from ledger where kind = 'transfer' and balance_delta > 0),0)
    ),
    'current', jsonb_build_object(
      'users', (select count(*) from public.profiles where deleted_at is null),
      'wallet_balances', coalesce((select sum(balance_delta) from public.wallet_transactions),0),
      'escrow_held', coalesce((select sum(escrow_delta) from public.wallet_transactions),0),
      'open_disputes', (select count(*) from public.disputes where status = 'open'),
      'pending_withdrawals', coalesce((select sum(amount) from public.withdrawals where status = 'requested'),0),
      'gateway_refunds_due', coalesce((select sum(amount) from public.payment_intents where status = 'refund_due'),0)
    ),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object(
      'date', d.day, 'marketplace_fees', coalesce(i.marketplace_fees,0), 'subscriptions', coalesce(i.subscriptions,0),
      'courses', coalesce(i.courses,0), 'catalog_collections', coalesce(i.catalog_collections,0),
      'signups', coalesce(s.signups,0), 'bookings', coalesce(b.bookings,0), 'orders', coalesce(o.orders,0)
    ) order by d.day),'[]'::jsonb) from dates d
      left join daily_income i using(day) left join daily_signups s using(day)
      left join daily_bookings b using(day) left join daily_orders o using(day))
  ) into v_result;
  return v_result;
end;
$$;
