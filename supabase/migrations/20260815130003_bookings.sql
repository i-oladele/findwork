-- Needed so an exclusion constraint can use gist on a plain equality column
-- (provider_id) combined with a range overlap check (the booking slot).
create extension if not exists btree_gist;

-- A generated column must be immutable, and timestamptz + interval is only
-- stable (a '1 day' interval depends on the session timezone). Adding whole
-- minutes never does, so this wrapper is honestly immutable.
create function public.booking_slot(p_start timestamptz, p_minutes integer)
returns tstzrange
language sql
immutable
as $$
  select tstzrange(p_start, p_start + p_minutes * interval '1 minute', '[)')
$$;

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles (id),
  -- Snapshot at booking time, same pattern as order_items.name/price —
  -- keeps the booking's displayed provider name stable even if the
  -- provider later renames their business.
  provider_name text not null,
  customer_id uuid not null references public.profiles (id),
  service text not null,
  price integer not null,
  fee integer not null default 0,
  start_at timestamptz not null,
  duration_minutes integer not null default 60,
  slot_range tstzrange generated always as (public.booking_slot(start_at, duration_minutes)) stored,
  status text not null default 'pending' check (status in ('pending', 'active', 'done', 'cancelled')),
  escrow_held integer not null default 0,
  created_at timestamptz not null default now(),

  -- The rule a client-side store can never truly enforce: no two active/pending
  -- bookings for the same provider with overlapping time slots.
  exclude using gist (provider_id with =, slot_range with &&)
    where (status in ('pending', 'active'))
);

alter table public.bookings enable row level security;

-- No insert/update policies: all mutation goes through the pay_booking /
-- complete_booking SECURITY DEFINER functions (migration 12), which run as
-- the table owner and enforce escrow rules atomically. Direct writes from
-- clients are never allowed.
create policy "Customers see their own bookings"
  on public.bookings for select
  to authenticated
  using (customer_id = auth.uid());

create policy "Providers see bookings made with them"
  on public.bookings for select
  to authenticated
  using (provider_id = auth.uid());
