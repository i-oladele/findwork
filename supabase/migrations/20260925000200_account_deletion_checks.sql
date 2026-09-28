-- Account deletion checks the money in the same transaction that anonymises.
--
-- The delete-account function used to read the wallet in one call and
-- anonymise in another. A failed read was treated as an empty wallet, so the
-- account was deleted anyway. It also looked only at the caller's own ledger.
-- That missed the money a customer holds in escrow for this person's jobs,
-- orders they have still to ship, open disputes, and withdrawals that have
-- already left the balance but have not been sent. Any of those would have
-- been stranded on a deleted account.
--
-- anonymise_profile now refuses, naming the reason, while any of them is
-- open. The check and the anonymisation are one transaction: if the check
-- cannot run, nothing is anonymised. A deleted seller's goods are also
-- hidden, so nobody can pay into escrow for a seller who cannot ship.

create or replace function public.anonymise_profile(p_profile_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_wallet record;
begin
  -- Serialises two deletions of the same account.
  perform 1 from public.profiles where id = p_profile_id for update;
  if not found then
    raise exception 'profile not found';
  end if;

  -- Open obligations are checked before the balance. Closing a booking or an
  -- order moves its money in the same transaction, so anything that closed
  -- before these checks has already reached the balance read after them.
  if exists (
    select 1 from public.bookings
    where p_profile_id in (customer_id, provider_id) and status in ('pending', 'active')
  ) then
    raise exception 'open_bookings';
  end if;
  if exists (
    select 1 from public.orders
    where (customer_id = p_profile_id or seller_id = p_profile_id) and status in ('placed', 'dispatched')
  ) then
    raise exception 'open_orders';
  end if;
  if exists (
    select 1 from public.disputes
    where (raised_by = p_profile_id or against_id = p_profile_id) and status = 'open'
  ) then
    raise exception 'open_disputes';
  end if;
  if exists (select 1 from public.withdrawals where profile_id = p_profile_id and status = 'requested') then
    raise exception 'withdrawal_pending';
  end if;

  -- The wallet lock holds off any spending while the balance is read.
  perform private.locked_balance(p_profile_id);
  select * into v_wallet from public.wallet_summary(p_profile_id);
  if v_wallet.escrow_held <> 0 then
    raise exception 'escrow_outstanding';
  end if;
  if v_wallet.balance <> 0 then
    raise exception 'balance_outstanding';
  end if;

  update public.profiles
  set full_name = 'Deleted user',
      phone = '',
      email = 'deleted+' || p_profile_id::text || '@findwork.invalid',
      location = null,
      address = null,
      avatar_url = null,
      -- A retry after the auth user failed to delete keeps the first date.
      deleted_at = coalesce(deleted_at, now())
  where id = p_profile_id;

  update public.provider_profiles
  set taking_bookings = false,
      business_name = 'Deleted user',
      bio = null
  where id = p_profile_id;

  update public.products
  set status = 'hidden', updated_at = now()
  where seller_id = p_profile_id and status <> 'hidden';

  delete from public.payout_accounts where profile_id = p_profile_id;
  delete from public.classifieds where seller_id = p_profile_id;
  update public.job_posts set status = 'closed' where customer_id = p_profile_id and status = 'open';
end;
$$;

revoke execute on function public.anonymise_profile(uuid) from public, anon, authenticated;
grant execute on function public.anonymise_profile(uuid) to service_role;
