-- Append-only ledger. The wallet balance and escrow-held amounts are never
-- stored as mutable columns anywhere — they are always the sum of this
-- table, so a client can never claim a balance that doesn't match reality.
create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id),
  label text not null,
  kind text not null check (kind in ('escrow', 'release', 'order', 'topup', 'fee', 'subscription')),
  -- balance_delta: change to spendable cash. escrow_delta: change to cash
  -- currently held in escrow. A booking payment is balance_delta < 0 and
  -- escrow_delta > 0 in the same row (money leaves "spendable", enters
  -- "held"); completing the booking is a separate row with escrow_delta < 0
  -- and balance_delta = 0 (money leaves "held", already left "spendable").
  balance_delta integer not null default 0,
  escrow_delta integer not null default 0,
  booking_id uuid references public.bookings (id),
  order_id uuid references public.orders (id),
  created_at timestamptz not null default now()
);

alter table public.wallet_transactions enable row level security;

create policy "Users see their own wallet transactions"
  on public.wallet_transactions for select
  to authenticated
  using (profile_id = auth.uid());

-- No insert/update/delete policy for any client role: every row is written
-- by a SECURITY DEFINER function (add_money, pay_booking, complete_booking,
-- place_order, subscribe_plan — migration 11), never directly by a user.

create function public.wallet_summary(p_profile_id uuid)
returns table (balance bigint, escrow_held bigint)
language sql
stable
as $$
  select
    coalesce(sum(balance_delta), 0)::bigint as balance,
    coalesce(sum(escrow_delta), 0)::bigint as escrow_held
  from public.wallet_transactions
  where profile_id = p_profile_id;
$$;
