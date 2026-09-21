-- Closes privilege holes found while wiring the app to real data. Each one
-- was reproduced against a local database before being fixed here.
--
--   1. The row-level update policies on profiles and provider_profiles only
--      checked *whose* row was being changed, not *which columns*. Any user
--      could set their own is_admin = true, and any provider could set their
--      own verified, rating, reviews and trust_score.
--   2. Postgres grants EXECUTE on new functions to PUBLIC, so internal
--      SECURITY DEFINER helpers were callable over the API: anonymise_profile
--      could wipe any user's profile, notify could fabricate a notification
--      to anyone, and add_money could mint balance.
--   3. thread_participants only exposed the caller's own membership row, so
--      the inbox could never learn who the other person in a thread was.

-- ---------------------------------------------------------------------------
-- Internal helpers live outside the API-exposed schema
-- ---------------------------------------------------------------------------

-- PostgREST only serves the schemas listed in config.toml ([api] schemas), so
-- functions here can be called from SECURITY DEFINER code but never by a
-- client, whatever their grants.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Column-level write permissions
-- ---------------------------------------------------------------------------

create function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- Where a signed-in user's orders are delivered. Free text because Nigerian
-- addresses rarely fit a structured form.
alter table public.profiles add column address text;

revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (full_name, phone, location, address, avatar_url) on public.profiles to authenticated;

-- The select policy lets any signed-in user read every profile, which is
-- right for names and avatars (counterparties, reviewers, sellers) but also
-- exposed every user's email, phone and — now — home address. Other people
-- see only the public columns; your own full row comes from get_my_profile.
revoke select on public.profiles from anon, authenticated;
grant select (id, full_name, location, avatar_url, is_admin, created_at, deleted_at)
  on public.profiles to authenticated;

create function public.get_my_profile()
returns public.profiles
language sql
stable
security definer set search_path = public
as $$
  select * from public.profiles where id = auth.uid();
$$;

-- verified, rating, reviews, jobs_done, trust_score, plan and priority are
-- earned or bought, never self-declared.
revoke insert, update, delete on public.provider_profiles from anon, authenticated;
grant insert (id, business_name, category, location, bio, price, price_unit, taking_bookings)
  on public.provider_profiles to authenticated;
grant update (business_name, category, location, bio, price, price_unit, taking_bookings)
  on public.provider_profiles to authenticated;

-- A reviewer may edit what they said, not which booking or provider it is about.
revoke update on public.reviews from anon, authenticated;
grant update (rating, body) on public.reviews to authenticated;

revoke update on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Function execute permissions
-- ---------------------------------------------------------------------------

-- Nothing is callable signed out, and new functions start closed to PUBLIC.
-- The PUBLIC default must be revoked globally: a per-schema default privilege
-- can only add to the global one, never take away from it. authenticated
-- keeps the explicit per-schema grant Supabase gives it.
revoke execute on all functions in schema public from public, anon;
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;

revoke execute on function public.notify(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.anonymise_profile(uuid) from public, anon, authenticated;
grant execute on function public.anonymise_profile(uuid) to service_role;

-- Crediting a wallet with no payment behind it. Replaced by the Paystack
-- flow (credit_topup, service role only) and admin_adjust_balance.
drop function public.add_money(integer);

-- ---------------------------------------------------------------------------
-- 3. Chat: see who else is in your threads
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER so the policy below can look at thread_participants
-- without recursing into its own RLS.
create function public.is_thread_participant(p_thread_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.thread_participants
    where thread_id = p_thread_id and profile_id = auth.uid()
  );
$$;

drop policy "Participants see their own thread membership" on public.thread_participants;

create policy "Participants see everyone in their threads"
  on public.thread_participants for select
  to authenticated
  using (public.is_thread_participant(thread_id));

create or replace function public.get_or_create_thread(p_other_profile_id uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_thread_id uuid;
begin
  if p_other_profile_id = auth.uid() then
    raise exception 'cannot message yourself';
  end if;
  if not exists (select 1 from public.profiles where id = p_other_profile_id and deleted_at is null) then
    raise exception 'user not found';
  end if;

  -- Two calls at once (a double tap) would each find no thread and each
  -- create one, splitting the conversation. Serialise per pair of people.
  perform pg_advisory_xact_lock(hashtextextended(
    least(auth.uid(), p_other_profile_id)::text || greatest(auth.uid(), p_other_profile_id)::text, 0));

  select tp1.thread_id into v_thread_id
  from public.thread_participants tp1
  join public.thread_participants tp2 on tp1.thread_id = tp2.thread_id
  where tp1.profile_id = auth.uid() and tp2.profile_id = p_other_profile_id
  limit 1;

  if v_thread_id is not null then
    return v_thread_id;
  end if;

  insert into public.chat_threads default values returning id into v_thread_id;
  insert into public.thread_participants (thread_id, profile_id) values
    (v_thread_id, auth.uid()),
    (v_thread_id, p_other_profile_id);

  return v_thread_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin read access
-- ---------------------------------------------------------------------------

-- Admins adjudicate disputes and process withdrawals, which means seeing
-- both sides of a booking, an order, and the ledger rows behind them.
create policy "Admins see all bookings" on public.bookings for select to authenticated using (public.is_admin());
create policy "Admins see all orders" on public.orders for select to authenticated using (public.is_admin());
create policy "Admins see all order items" on public.order_items for select to authenticated using (public.is_admin());
create policy "Admins see all wallet transactions" on public.wallet_transactions for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Shared internals
-- ---------------------------------------------------------------------------

-- Every function that debits a wallet checks the balance first. Without a
-- lock, two requests in flight at once both see the same balance and both
-- spend it. The advisory lock serialises spending per wallet for the rest of
-- the transaction.
create function private.locked_balance(p_profile_id uuid)
returns bigint
language plpgsql
security definer set search_path = public
as $$
declare
  v_balance bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('wallet:' || p_profile_id::text, 0));
  select balance into v_balance from public.wallet_summary(p_profile_id);
  return coalesce(v_balance, 0);
end;
$$;

create function private.notify_admins(p_kind text, p_title text, p_body text, p_ref_type text, p_ref_id text)
returns void
language sql
security definer set search_path = public
as $$
  insert into public.notifications (profile_id, kind, title, body, ref_type, ref_id)
  select id, p_kind, p_title, p_body, p_ref_type, p_ref_id
  from public.profiles
  where is_admin and deleted_at is null;
$$;

-- More notification kinds for the flows added in the following migrations.
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('booking', 'quote', 'message', 'payment', 'dispute', 'review', 'system', 'order', 'support'));

-- More ledger kinds: refunds, course fees, withdrawals and admin adjustments.
alter table public.wallet_transactions drop constraint wallet_transactions_kind_check;
alter table public.wallet_transactions add constraint wallet_transactions_kind_check
  check (kind in ('escrow', 'release', 'order', 'topup', 'fee', 'subscription', 'refund', 'course', 'withdrawal', 'adjustment'));

create index wallet_transactions_profile_idx on public.wallet_transactions (profile_id, created_at desc);
