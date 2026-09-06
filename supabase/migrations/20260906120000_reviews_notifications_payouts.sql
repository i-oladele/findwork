-- Adds the three things the schema was missing to support a real launch:
--   1. reviews      — provider_profiles.rating/reviews had no source table
--   2. notifications— nothing could tell a user something happened
--   3. provider payouts — complete_booking released escrow from the customer
--      but never credited the provider, so money left the system entirely.

-- ---------------------------------------------------------------------------
-- 1. Reviews
-- ---------------------------------------------------------------------------

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  -- One review per booking: the review right is earned by completing a job,
  -- which is what stops rating farming from unpaid accounts.
  booking_id uuid not null unique references public.bookings (id) on delete cascade,
  reviewer_id uuid not null references public.profiles (id),
  provider_id uuid not null references public.provider_profiles (id),
  rating integer not null check (rating between 1 and 5),
  body text not null default '',
  created_at timestamptz not null default now()
);

create index reviews_provider_id_idx on public.reviews (provider_id, created_at desc);

alter table public.reviews enable row level security;

create policy "Reviews are viewable by authenticated users"
  on public.reviews for select
  to authenticated
  using (true);

-- A review may only be written by the customer on that booking, and only
-- once the booking is actually done. Enforced here rather than in an RPC
-- because it is a single ownership-checked insert.
create policy "The paying customer can review a completed booking"
  on public.reviews for insert
  to authenticated
  with check (
    reviewer_id = auth.uid()
    and exists (
      select 1 from public.bookings b
      where b.id = reviews.booking_id
        and b.customer_id = auth.uid()
        and b.provider_id = reviews.provider_id
        and b.status = 'done'
    )
  );

create policy "A reviewer can edit their own review"
  on public.reviews for update
  to authenticated
  using (reviewer_id = auth.uid())
  with check (reviewer_id = auth.uid());

-- Keep the denormalised rating/reviews columns on provider_profiles correct.
-- They are read on every search and listing screen, so recomputing them per
-- query would be the most expensive thing in the app.
create function public.recompute_provider_rating()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_provider_id uuid := coalesce(new.provider_id, old.provider_id);
begin
  update public.provider_profiles p
  set rating = coalesce(agg.avg_rating, 0),
      reviews = coalesce(agg.n, 0)
  from (
    select round(avg(rating)::numeric, 1) as avg_rating, count(*) as n
    from public.reviews
    where provider_id = v_provider_id
  ) agg
  where p.id = v_provider_id;
  return null;
end;
$$;

create trigger reviews_recompute_rating
  after insert or update or delete on public.reviews
  for each row execute procedure public.recompute_provider_rating();

-- ---------------------------------------------------------------------------
-- 2. Notifications
-- ---------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('booking', 'quote', 'message', 'payment', 'dispute', 'review', 'system')),
  title text not null,
  body text not null default '',
  ref_type text,
  ref_id text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_inbox_idx on public.notifications (profile_id, created_at desc);

alter table public.notifications enable row level security;

create policy "Users see their own notifications"
  on public.notifications for select
  to authenticated
  using (profile_id = auth.uid());

-- No insert policy: notifications are only ever raised server-side by the
-- notify() helper below, so a client cannot fabricate one.
create policy "Users can mark their own notifications read"
  on public.notifications for update
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create function public.notify(
  p_profile_id uuid,
  p_kind text,
  p_title text,
  p_body text default '',
  p_ref_type text default null,
  p_ref_id text default null
)
returns void
language sql
security definer set search_path = public
as $$
  insert into public.notifications (profile_id, kind, title, body, ref_type, ref_id)
  values (p_profile_id, p_kind, p_title, p_body, p_ref_type, p_ref_id);
$$;

create function public.mark_notification_read(p_notification_id uuid)
returns void
language sql
security definer set search_path = public
as $$
  update public.notifications
  set read_at = now()
  where id = p_notification_id and profile_id = auth.uid();
$$;

-- A new chat message notifies every other participant in the thread.
create function public.notify_on_message()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_sender text;
begin
  select full_name into v_sender from public.profiles where id = new.sender_id;

  insert into public.notifications (profile_id, kind, title, body, ref_type, ref_id)
  select tp.profile_id,
         'message',
         coalesce(nullif(v_sender, ''), 'New message'),
         case when new.kind = 'voice' then 'Sent a voice note' else left(new.text, 140) end,
         'thread',
         new.thread_id::text
  from public.thread_participants tp
  where tp.thread_id = new.thread_id and tp.profile_id <> new.sender_id;

  return new;
end;
$$;

create trigger chat_messages_notify
  after insert on public.chat_messages
  for each row execute procedure public.notify_on_message();

alter publication supabase_realtime add table public.notifications;

-- ---------------------------------------------------------------------------
-- 3. Provider payouts
-- ---------------------------------------------------------------------------

-- Previous version released the customer's escrow but never credited the
-- provider — the money simply left the ledger. Now the release is two rows:
-- escrow leaves the customer, and the job price (total minus the platform
-- fee already charged at booking time) lands in the provider's balance.
create or replace function public.complete_booking(p_booking_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_booking public.bookings;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking is null then
    raise exception 'booking not found';
  end if;
  if v_booking.customer_id <> auth.uid() then
    raise exception 'not your booking';
  end if;
  if v_booking.status = 'done' then
    return;
  end if;
  if v_booking.status = 'cancelled' then
    raise exception 'booking was cancelled';
  end if;

  update public.bookings set status = 'done' where id = p_booking_id;

  -- Customer: escrow released (the cash already left their balance at booking).
  insert into public.wallet_transactions (profile_id, label, kind, escrow_delta, booking_id)
  values (auth.uid(), 'Released to ' || v_booking.provider_name, 'release', -v_booking.escrow_held, p_booking_id);

  -- Provider: paid the job price. The platform retains v_booking.fee.
  insert into public.wallet_transactions (profile_id, label, kind, balance_delta, booking_id)
  values (v_booking.provider_id, 'Payout · ' || v_booking.service, 'release', v_booking.price, p_booking_id);

  update public.provider_profiles
  set jobs_done = jobs_done + 1
  where id = v_booking.provider_id;

  perform public.notify(
    v_booking.provider_id,
    'payment',
    'You have been paid',
    'Payment released for ' || v_booking.service,
    'booking',
    p_booking_id::text
  );

  return;
end;
$$;

-- Booking a provider should tell them about it.
create or replace function public.pay_booking(
  p_provider_id uuid,
  p_service text,
  p_price integer,
  p_start_at timestamptz,
  p_duration_minutes integer default 60
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_provider_name text;
  v_taking boolean;
  v_fee integer;
  v_total integer;
  v_balance bigint;
  v_booking_id uuid;
begin
  if p_price <= 0 then
    raise exception 'price must be positive';
  end if;
  if p_start_at < now() then
    raise exception 'cannot book a time in the past';
  end if;

  select business_name, taking_bookings into v_provider_name, v_taking
  from public.provider_profiles where id = p_provider_id;

  if v_provider_name is null then
    raise exception 'provider not found';
  end if;
  if not v_taking then
    raise exception 'provider is not taking bookings';
  end if;
  if p_provider_id = auth.uid() then
    raise exception 'cannot book yourself';
  end if;

  v_fee := round(p_price * 0.05);
  v_total := p_price + v_fee;

  select balance into v_balance from public.wallet_summary(auth.uid());
  if v_balance < v_total then
    raise exception 'insufficient_balance';
  end if;

  insert into public.bookings (provider_id, provider_name, customer_id, service, price, fee, start_at, duration_minutes, status, escrow_held)
  values (p_provider_id, v_provider_name, auth.uid(), p_service, p_price, v_fee, p_start_at, p_duration_minutes, 'active', v_total)
  returning id into v_booking_id;

  insert into public.wallet_transactions (profile_id, label, kind, balance_delta, escrow_delta, booking_id)
  values (auth.uid(), 'Escrow · ' || v_provider_name, 'escrow', -v_total, v_total, v_booking_id);

  perform public.notify(
    p_provider_id,
    'booking',
    'New booking',
    p_service,
    'booking',
    v_booking_id::text
  );

  return v_booking_id;
end;
$$;
