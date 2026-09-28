-- A top-up that lands after its account was deleted is refunded, not credited.
--
-- Paystack can confirm a payment minutes after the person paid: the webhook
-- is retried, and bank transfers settle late. If they deleted their account
-- in between, credit_topup put the money into a wallet nobody can sign in to
-- or withdraw from. Deletion requires an empty wallet, so the money was
-- stranded for good.
--
-- Now credit_topup checks the account under the same row lock that deletion
-- takes, so the two cannot interleave: either the credit lands first and
-- deletion refuses (the wallet is no longer empty), or deletion lands first
-- and the payment is marked refund_due. The team sees it in /admin → Payouts,
-- refunds it from the Paystack dashboard, and marks it refunded, the same
-- by-hand path withdrawals take.

alter table public.payment_intents drop constraint payment_intents_status_check;
alter table public.payment_intents add constraint payment_intents_status_check
  check (status in ('pending', 'success', 'failed', 'refund_due', 'refunded'));

alter table public.payment_intents
  add column refund_note text,
  add column refunded_by uuid references public.profiles (id),
  add column refunded_at timestamptz;

create policy "Admins see payment intents"
  on public.payment_intents for select
  to authenticated
  using (public.is_admin());

create or replace function public.credit_topup(p_reference text, p_amount_kobo bigint)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_intent public.payment_intents;
  v_deleted_at timestamptz;
begin
  select * into v_intent from public.payment_intents where reference = p_reference for update;
  if v_intent is null then
    raise exception 'unknown reference';
  end if;
  if v_intent.status in ('success', 'refund_due', 'refunded') then
    return false;
  end if;
  if p_amount_kobo <> v_intent.amount::bigint * 100 then
    raise exception 'amount mismatch';
  end if;

  -- anonymise_profile holds this row FOR UPDATE while it checks the wallet.
  select deleted_at into v_deleted_at from public.profiles where id = v_intent.profile_id for share;

  if v_deleted_at is not null then
    update public.payment_intents set status = 'refund_due', paid_at = now() where id = v_intent.id;
    perform private.notify_admins('payment', 'Top-up to refund',
      '₦' || to_char(v_intent.amount, 'FM999,999,999') || ' paid into a deleted account · ' || v_intent.reference,
      'admin_refund', v_intent.id::text);
    return false;
  end if;

  update public.payment_intents set status = 'success', paid_at = now() where id = v_intent.id;

  insert into public.wallet_transactions (profile_id, label, kind, balance_delta)
  values (v_intent.profile_id, 'Top-up · Paystack', 'topup', v_intent.amount);

  perform public.notify(v_intent.profile_id, 'payment', 'Money added',
    '₦' || to_char(v_intent.amount, 'FM999,999,999') || ' is in your wallet.', 'wallet', null);

  return true;
end;
$$;

revoke execute on function public.credit_topup(text, bigint) from public, anon, authenticated;
grant execute on function public.credit_topup(text, bigint) to service_role;

-- Called once the money has been sent back from the Paystack dashboard.
create function public.admin_mark_topup_refunded(p_intent_id uuid, p_note text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_intent public.payment_intents;
begin
  if not public.is_admin() then
    raise exception 'admins only';
  end if;
  if coalesce(trim(p_note), '') = '' then
    raise exception 'reason required';
  end if;

  select * into v_intent from public.payment_intents where id = p_intent_id for update;
  if v_intent is null then
    raise exception 'payment not found';
  end if;
  if v_intent.status <> 'refund_due' then
    raise exception 'payment is not awaiting a refund';
  end if;

  update public.payment_intents
  set status = 'refunded', refund_note = trim(p_note), refunded_by = auth.uid(), refunded_at = now()
  where id = p_intent_id;
end;
$$;

revoke execute on function public.admin_mark_topup_refunded(uuid, text) from public, anon;
grant execute on function public.admin_mark_topup_refunded(uuid, text) to authenticated;
