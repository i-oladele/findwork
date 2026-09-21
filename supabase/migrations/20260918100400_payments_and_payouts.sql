-- Real money in and out.
--
-- In: a top-up starts as a payment_intent created by the paystack-initialize
-- Edge Function. The wallet is credited only by credit_topup, which only the
-- service role can call, from either the signature-verified webhook or a
-- server-side verify call to Paystack. Both may fire for the same payment,
-- so crediting is idempotent on the reference.
--
-- Out: a provider saves a bank account and requests a withdrawal, which
-- takes the money out of their balance at once (so it cannot be spent
-- twice) and queues it for the team to send. A rejected withdrawal is
-- reversed. Automating the send via Paystack Transfers is the next step.

-- ---------------------------------------------------------------------------
-- Top-ups
-- ---------------------------------------------------------------------------

create table public.payment_intents (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id),
  reference text not null unique,
  -- Naira. Paystack is sent kobo (x100) and the webhook's kobo is checked
  -- against this before anything is credited.
  amount integer not null check (amount > 0),
  provider text not null default 'paystack',
  status text not null default 'pending' check (status in ('pending', 'success', 'failed')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index payment_intents_profile_idx on public.payment_intents (profile_id, created_at desc);

alter table public.payment_intents enable row level security;

create policy "Users see their own payment intents"
  on public.payment_intents for select
  to authenticated
  using (profile_id = auth.uid());

-- Returns true if this call credited the wallet, false if the reference was
-- already settled (a webhook and a verify racing each other).
create function public.credit_topup(p_reference text, p_amount_kobo bigint)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_intent public.payment_intents;
begin
  select * into v_intent from public.payment_intents where reference = p_reference for update;
  if v_intent is null then
    raise exception 'unknown reference';
  end if;
  if v_intent.status = 'success' then
    return false;
  end if;
  if p_amount_kobo <> v_intent.amount::bigint * 100 then
    raise exception 'amount mismatch';
  end if;

  update public.payment_intents set status = 'success', paid_at = now() where id = v_intent.id;

  insert into public.wallet_transactions (profile_id, label, kind, balance_delta)
  values (v_intent.profile_id, 'Top-up · Paystack', 'topup', v_intent.amount);

  perform public.notify(v_intent.profile_id, 'payment', 'Money added',
    '₦' || to_char(v_intent.amount, 'FM999,999,999') || ' is in your wallet.', 'wallet', null);

  return true;
end;
$$;

create function public.fail_topup(p_reference text)
returns void
language sql
security definer set search_path = public
as $$
  update public.payment_intents set status = 'failed' where reference = p_reference and status = 'pending';
$$;

revoke execute on function public.credit_topup(text, bigint) from public, anon, authenticated;
revoke execute on function public.fail_topup(text) from public, anon, authenticated;
grant execute on function public.credit_topup(text, bigint) to service_role;
grant execute on function public.fail_topup(text) to service_role;

-- ---------------------------------------------------------------------------
-- Admin balance adjustment
-- ---------------------------------------------------------------------------

-- For correcting mistakes and funding test accounts. Every use is a labelled
-- ledger row naming the admin, so it is auditable after the fact.
create function public.admin_adjust_balance(p_profile_id uuid, p_amount integer, p_reason text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_admin text;
begin
  if not public.is_admin() then
    raise exception 'admins only';
  end if;
  if p_amount = 0 then
    raise exception 'amount must not be zero';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'reason required';
  end if;
  if p_amount < 0 and private.locked_balance(p_profile_id) < -p_amount then
    raise exception 'insufficient_balance';
  end if;

  select full_name into v_admin from public.profiles where id = auth.uid();

  insert into public.wallet_transactions (profile_id, label, kind, balance_delta)
  values (p_profile_id, 'Adjustment · ' || trim(p_reason) || ' (' || coalesce(nullif(v_admin, ''), 'admin') || ')', 'adjustment', p_amount);

  perform public.notify(p_profile_id, 'payment', 'Wallet adjusted',
    trim(p_reason) || ' · ' || case when p_amount > 0 then '+' else '−' end || '₦' || to_char(abs(p_amount), 'FM999,999,999'),
    'wallet', null);
end;
$$;

-- Emails and phones are not readable from the profiles table, admins
-- included, so finding a user to fund or help goes through here.
create function public.admin_find_profiles(p_query text)
returns table (id uuid, full_name text, email text, phone text, balance bigint)
language plpgsql
stable
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admins only';
  end if;
  return query
    select p.id, p.full_name, p.email, p.phone, (select w.balance from public.wallet_summary(p.id) w)
    from public.profiles p
    where p.deleted_at is null
      and length(trim(p_query)) >= 3
      and (p.email ilike '%' || trim(p_query) || '%'
           or p.full_name ilike '%' || trim(p_query) || '%'
           or p.phone ilike '%' || trim(p_query) || '%')
    order by p.full_name
    limit 20;
end;
$$;

-- ---------------------------------------------------------------------------
-- Payout accounts and withdrawals
-- ---------------------------------------------------------------------------

create table public.payout_accounts (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  bank_name text not null,
  account_number text not null check (account_number ~ '^[0-9]{10}$'),
  account_name text not null,
  updated_at timestamptz not null default now()
);

alter table public.payout_accounts enable row level security;

create policy "Users manage their own payout account"
  on public.payout_accounts for all
  to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "Admins see payout accounts"
  on public.payout_accounts for select
  to authenticated
  using (public.is_admin());

create table public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id),
  amount integer not null check (amount > 0),
  -- Snapshot, so changing your bank details later cannot redirect money
  -- already requested.
  bank_name text not null,
  account_number text not null,
  account_name text not null,
  status text not null default 'requested' check (status in ('requested', 'paid', 'rejected')),
  note text,
  processed_by uuid references public.profiles (id),
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index withdrawals_status_idx on public.withdrawals (status, created_at);

alter table public.withdrawals enable row level security;

create policy "Users see their own withdrawals"
  on public.withdrawals for select
  to authenticated
  using (profile_id = auth.uid() or public.is_admin());

alter table public.wallet_transactions add column withdrawal_id uuid references public.withdrawals (id);

create function public.request_withdrawal(p_amount integer)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_account public.payout_accounts;
  v_id uuid;
begin
  if p_amount < 1000 then
    raise exception 'minimum withdrawal is ₦1,000';
  end if;

  select * into v_account from public.payout_accounts where profile_id = auth.uid();
  if v_account is null then
    raise exception 'add a bank account first';
  end if;

  if private.locked_balance(auth.uid()) < p_amount then
    raise exception 'insufficient_balance';
  end if;

  insert into public.withdrawals (profile_id, amount, bank_name, account_number, account_name)
  values (auth.uid(), p_amount, v_account.bank_name, v_account.account_number, v_account.account_name)
  returning id into v_id;

  insert into public.wallet_transactions (profile_id, label, kind, balance_delta, withdrawal_id)
  values (auth.uid(), 'Withdrawal to ' || v_account.bank_name || ' ···' || right(v_account.account_number, 4),
    'withdrawal', -p_amount, v_id);

  perform private.notify_admins('payment', 'Withdrawal requested',
    '₦' || to_char(p_amount, 'FM999,999,999') || ' to ' || v_account.bank_name, 'admin_withdrawal', v_id::text);

  return v_id;
end;
$$;

create function public.admin_process_withdrawal(p_withdrawal_id uuid, p_paid boolean, p_note text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_w public.withdrawals;
begin
  if not public.is_admin() then
    raise exception 'admins only';
  end if;

  select * into v_w from public.withdrawals where id = p_withdrawal_id for update;
  if v_w is null then
    raise exception 'withdrawal not found';
  end if;
  if v_w.status <> 'requested' then
    raise exception 'withdrawal already processed';
  end if;

  update public.withdrawals
  set status = case when p_paid then 'paid' else 'rejected' end,
      note = nullif(trim(p_note), ''), processed_by = auth.uid(), processed_at = now()
  where id = p_withdrawal_id;

  if p_paid then
    perform public.notify(v_w.profile_id, 'payment', 'Withdrawal sent',
      '₦' || to_char(v_w.amount, 'FM999,999,999') || ' to ' || v_w.bank_name || ' ···' || right(v_w.account_number, 4),
      'wallet', null);
  else
    insert into public.wallet_transactions (profile_id, label, kind, balance_delta, withdrawal_id)
    values (v_w.profile_id, 'Withdrawal reversed', 'withdrawal', v_w.amount, v_w.id);
    perform public.notify(v_w.profile_id, 'payment', 'Withdrawal not sent',
      coalesce(nullif(trim(p_note), ''), 'The money is back in your wallet.'), 'wallet', null);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Account deletion also removes bank details
-- ---------------------------------------------------------------------------

create or replace function public.anonymise_profile(p_profile_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.profiles
  set full_name = 'Deleted user',
      phone = '',
      email = 'deleted+' || p_profile_id::text || '@findwork.invalid',
      location = null,
      address = null,
      avatar_url = null,
      deleted_at = now()
  where id = p_profile_id;

  update public.provider_profiles
  set taking_bookings = false,
      business_name = 'Deleted user',
      bio = null
  where id = p_profile_id;

  delete from public.payout_accounts where profile_id = p_profile_id;
  delete from public.classifieds where seller_id = p_profile_id;
  update public.job_posts set status = 'closed' where customer_id = p_profile_id and status = 'open';
end;
$$;

revoke execute on function public.anonymise_profile(uuid) from public, anon, authenticated;
grant execute on function public.anonymise_profile(uuid) to service_role;

-- Belt and braces after every function this set of migrations defines:
-- nothing in public is executable by PUBLIC or signed-out users.
revoke execute on all functions in schema public from public, anon;
