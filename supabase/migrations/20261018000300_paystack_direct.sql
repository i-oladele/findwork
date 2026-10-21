-- Paystack used directly, not only to top up the wallet.
--
-- PRD Shopping Cart & Checkout, "Integrated with Payment Gateway": an order
-- can be paid by card at checkout. When Paystack confirms the payment, the
-- money is credited and the order placed in the same transaction, through
-- the same place_order and the same price check as a wallet payment. If the
-- order can no longer be placed (stock ran out, a coupon was used up), the
-- money stays in the wallet and the customer is told why: nothing is lost.
--
-- PRD Subscription Billing, "Integrated with Payment Providers": a plan can
-- be paid by card, and that card kept to renew it. Each renewal charges the
-- saved card through Paystack; if the card is declined, the wallet is tried,
-- and only then does the plan drop to Free.
--
-- PRD Wallet, "Withdrawals" and "Integrated with Payment Gateways": a bank
-- account confirmed with Paystack (the bank's own name for it, and a
-- transfer recipient) is paid automatically by Paystack Transfers, up to a
-- limit finance staff set. Anything above it, to an unconfirmed account, or
-- from an account with an open high-risk alert waits for staff as before.
--
-- The database never talks to Paystack. It asks the paystack-charge and
-- paystack-payout Edge Functions through pg_net, with a shared secret, once
-- these rows are set (after deploying both functions):
--   insert into private.settings values
--     ('paystack_charge_url', 'https://<project-ref>.supabase.co/functions/v1/paystack-charge'),
--     ('paystack_payout_url', 'https://<project-ref>.supabase.co/functions/v1/paystack-payout'),
--     ('paystack_hook_secret', '<the PAYSTACK_HOOK_SECRET function secret>');
-- Until then card renewals fall back to the wallet and payouts stay manual.

-- ---------------------------------------------------------------------------
-- 1. What a payment is for, and saved cards
-- ---------------------------------------------------------------------------

create table public.payment_cards (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  -- Paystack's reusable authorization. It can charge the card, so it never
  -- leaves the server: users can read the card's description, not this.
  authorization_code text not null,
  signature text not null,
  email text not null,
  brand text,
  last4 text not null check (last4 ~ '^[0-9]{4}$'),
  exp_month smallint check (exp_month between 1 and 12),
  exp_year smallint,
  bank text,
  created_at timestamptz not null default now(),
  unique (profile_id, signature)
);
alter table public.payment_cards enable row level security;
revoke all on public.payment_cards from anon, authenticated;
grant select (id, profile_id, brand, last4, exp_month, exp_year, bank, created_at) on public.payment_cards to authenticated;
create policy "Owner reads their cards" on public.payment_cards for select to authenticated using (profile_id = auth.uid());

alter table public.payment_intents
  add column purpose text not null default 'topup' check (purpose in ('topup', 'checkout', 'plan', 'renewal')),
  -- What to do once paid: the cart for a checkout, the plan for a plan.
  add column payload jsonb not null default '{}'::jsonb,
  -- What happened after payment: the orders placed, or why they could not be.
  add column outcome jsonb,
  add column card_id uuid references public.payment_cards(id) on delete set null,
  -- For a renewal: which renewal it pays, so each is charged once.
  add column for_renews_at timestamptz;
create unique index payment_intents_one_charge_per_renewal on public.payment_intents(profile_id, for_renews_at) where purpose = 'renewal';

-- The card a plan renews from. Null renews from the wallet.
alter table public.subscriptions add column card_id uuid references public.payment_cards(id) on delete set null;

create function public.remove_payment_card(p_card_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.payment_cards where id = p_card_id and profile_id = auth.uid();
  if not found then raise exception 'card not found'; end if;
end;
$$;

-- Which saved card renews the plan; null to renew from the wallet.
create function public.set_plan_card(p_card_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_card_id is not null and not exists(select 1 from public.payment_cards where id = p_card_id and profile_id = auth.uid()) then
    raise exception 'card not found';
  end if;
  update public.subscriptions set card_id = p_card_id where profile_id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Renewing one plan
-- ---------------------------------------------------------------------------

-- Charges a due plan from the wallet, or moves it to Free when the wallet
-- cannot cover it. p_after_card says a card was tried first, for the message.
create function private.renew_from_wallet(p_profile_id uuid, p_after_card text)
returns text language plpgsql security definer set search_path = public as $$
declare v_sub record;
begin
  select s.profile_id, s.renews_at, sp.id as plan_id, sp.name, sp.price into v_sub
  from public.subscriptions s join public.subscription_plans sp on sp.id = s.plan
  where s.profile_id = p_profile_id for update of s;
  if v_sub.profile_id is null or v_sub.price = 0 or v_sub.renews_at > now() then return 'not_due'; end if;
  if private.locked_balance(p_profile_id) >= v_sub.price then
    insert into public.wallet_transactions (profile_id, label, kind, balance_delta)
    values (p_profile_id, v_sub.name || ' plan · 1 month', 'subscription', -v_sub.price);
    update public.subscriptions set renews_at = renews_at + interval '1 month' where profile_id = p_profile_id;
    perform public.notify(p_profile_id, 'payment', v_sub.name || ' plan renewed',
      case p_after_card
        when 'card' then '₦' || to_char(v_sub.price, 'FM999,999,999') || ' charged to your card.'
        when 'declined' then 'Your card was declined, so ₦' || to_char(v_sub.price, 'FM999,999,999') || ' was taken from your wallet instead.'
        else '₦' || to_char(v_sub.price, 'FM999,999,999') || ' taken from your wallet.' end,
      'billing', null);
    return 'renewed';
  end if;
  update public.subscriptions set plan = 'free', since = now(), renews_at = null where profile_id = p_profile_id;
  update public.provider_profiles set plan = 'free', priority = 0 where id = p_profile_id;
  perform public.notify(p_profile_id, 'payment', 'Moved to the Free plan',
    case when p_after_card = 'declined'
      then 'Your card was declined and your wallet could not cover the ' || v_sub.name || ' renewal. Switch back any time.'
      else 'Your wallet could not cover the ' || v_sub.name || ' renewal. Top up and switch back any time.' end,
    'billing', null);
  return 'downgraded';
end;
$$;
revoke all on function private.renew_from_wallet(uuid, text) from public, anon, authenticated;

-- Each due plan: a plan with a saved card asks Paystack to charge it and
-- waits for the answer (at most a day); any other is charged from the wallet.
create or replace function private.renew_subscriptions()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_sub record;
  v_count integer := 0;
  v_intent public.payment_intents;
  v_reference text;
  v_url text := (select value from private.settings where key = 'paystack_charge_url');
  v_secret text := (select value from private.settings where key = 'paystack_hook_secret');
  v_after_card text;
begin
  for v_sub in
    select s.profile_id, s.renews_at, s.card_id, sp.id as plan_id, sp.price
    from public.subscriptions s
    join public.subscription_plans sp on sp.id = s.plan
    where sp.price > 0 and s.renews_at <= now()
    for update of s
  loop
    v_after_card := null;
    if v_sub.card_id is not null and v_url is not null and v_secret is not null then
      select * into v_intent from public.payment_intents
      where purpose = 'renewal' and profile_id = v_sub.profile_id and for_renews_at = v_sub.renews_at;
      if v_intent.id is null then
        v_reference := 'fw_renew_' || replace(gen_random_uuid()::text, '-', '');
        insert into public.payment_intents(profile_id, reference, amount, purpose, payload, card_id, for_renews_at)
        values (v_sub.profile_id, v_reference, v_sub.price, 'renewal', jsonb_build_object('plan', v_sub.plan_id), v_sub.card_id, v_sub.renews_at);
        begin
          perform net.http_post(
            url := v_url,
            headers := jsonb_build_object('Content-Type', 'application/json', 'x-paystack-hook-secret', v_secret),
            body := jsonb_build_object('reference', v_reference));
        exception when others then
          raise warning 'renewal charge request failed: %', sqlerrm;
        end;
        v_count := v_count + 1;
        continue;
      elsif v_intent.status = 'success' or (v_intent.status = 'pending' and v_intent.created_at > now() - interval '1 day') then
        -- Paid already, or the answer is still on its way.
        continue;
      elsif v_intent.status = 'pending' then
        update public.payment_intents set status = 'failed', outcome = jsonb_build_object('error', 'no answer from Paystack') where id = v_intent.id;
      end if;
      v_after_card := 'declined';
    end if;
    perform private.renew_from_wallet(v_sub.profile_id, v_after_card);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function private.remind_subscription_renewals()
returns integer language plpgsql security definer set search_path = public as $$
declare v_sub record; v_inserted integer; v_sent integer := 0;
begin
  for v_sub in
    select s.profile_id, s.plan, s.renews_at, p.name, p.price, c.last4
    from public.subscriptions s
    join public.subscription_plans p on p.id = s.plan
    join public.profiles u on u.id = s.profile_id
    left join public.payment_cards c on c.id = s.card_id
    where p.price > 0 and u.deleted_at is null
      and s.renews_at > now() and s.renews_at <= now() + interval '3 days'
    order by s.profile_id
    for update of s skip locked
  loop
    insert into public.subscription_reminders(profile_id, plan, renews_at)
    values(v_sub.profile_id, v_sub.plan, v_sub.renews_at) on conflict do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 1 then
      perform public.notify(v_sub.profile_id, 'payment', 'Your plan renews soon',
        v_sub.name || ' renews on ' || to_char(v_sub.renews_at at time zone 'Africa/Lagos', 'DD Mon YYYY') ||
        ' for ₦' || to_char(v_sub.price, 'FM999,999,999') || '. ' ||
        case when v_sub.last4 is not null
          then 'We will charge your card ending ' || v_sub.last4 || ', or your wallet if the card is declined.'
          else 'Keep enough in your wallet or change your plan before renewal.' end,
        'billing', v_sub.profile_id::text);
      v_sent := v_sent + 1;
    end if;
  end loop;
  return v_sent;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Settling a card payment
-- ---------------------------------------------------------------------------

-- Service role only, from paystack-verify, paystack-webhook or
-- paystack-charge once Paystack says the money arrived. Idempotent on the
-- reference: whichever caller lands first settles it.
--
-- p_authorization is Paystack's authorization object; a reusable card is
-- kept only when its owner asked, by paying for a plan with "keep this card".
create function public.settle_payment(p_reference text, p_amount_kobo bigint, p_authorization jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_intent public.payment_intents;
  v_deleted_at timestamptz;
  v_card uuid;
  v_outcome jsonb;
  v_prev_sub text;
  v_prev_claims text;
  v_amount text;
begin
  select * into v_intent from public.payment_intents where reference = p_reference for update;
  if v_intent is null then raise exception 'unknown reference'; end if;
  if v_intent.status in ('success', 'refund_due', 'refunded') then
    return jsonb_build_object('credited', false, 'status', v_intent.status, 'outcome', v_intent.outcome);
  end if;
  if p_amount_kobo <> v_intent.amount::bigint * 100 then raise exception 'amount mismatch'; end if;
  v_amount := '₦' || to_char(v_intent.amount, 'FM999,999,999');

  -- anonymise_profile holds this row FOR UPDATE while it checks the wallet.
  select deleted_at into v_deleted_at from public.profiles where id = v_intent.profile_id for share;
  if v_deleted_at is not null then
    update public.payment_intents set status = 'refund_due', paid_at = now() where id = v_intent.id;
    perform private.notify_admins('payment', 'Top-up to refund',
      v_amount || ' paid into a deleted account · ' || v_intent.reference, 'admin_refund', v_intent.id::text);
    return jsonb_build_object('credited', false, 'status', 'refund_due', 'outcome', null);
  end if;

  if v_intent.purpose = 'plan' and coalesce((v_intent.payload->>'save_card')::boolean, false)
     and coalesce((p_authorization->>'reusable')::boolean, false)
     and p_authorization->>'authorization_code' is not null and p_authorization->>'signature' is not null
     and coalesce(p_authorization->>'last4', '') ~ '^[0-9]{4}$' then
    insert into public.payment_cards(profile_id, authorization_code, signature, email, brand, last4, exp_month, exp_year, bank)
    values (v_intent.profile_id, p_authorization->>'authorization_code', p_authorization->>'signature',
      coalesce(nullif(p_authorization->>'email', ''), v_intent.payload->>'email', ''), nullif(p_authorization->>'card_type', ''),
      p_authorization->>'last4', nullif(p_authorization->>'exp_month', '')::smallint, nullif(p_authorization->>'exp_year', '')::smallint,
      nullif(p_authorization->>'bank', ''))
    on conflict (profile_id, signature) do update
      set authorization_code = excluded.authorization_code, exp_month = excluded.exp_month, exp_year = excluded.exp_year
    returning id into v_card;
  end if;
  v_card := coalesce(v_card, v_intent.card_id);

  update public.payment_intents set status = 'success', paid_at = now(), card_id = v_card where id = v_intent.id;
  insert into public.wallet_transactions (profile_id, label, kind, balance_delta)
  values (v_intent.profile_id, case v_intent.purpose when 'topup' then 'Top-up · Paystack' else 'Card payment · Paystack' end, 'topup', v_intent.amount);

  if v_intent.purpose = 'topup' then
    perform public.notify(v_intent.profile_id, 'payment', 'Money added', v_amount || ' is in your wallet.', 'wallet', null);
    return jsonb_build_object('credited', true, 'status', 'success', 'outcome', null);
  end if;

  if v_intent.purpose = 'renewal' then
    v_outcome := jsonb_build_object('renewal', private.renew_from_wallet(v_intent.profile_id, 'card'));
  else
    -- The order or plan is placed as the payer, exactly as if they had
    -- pressed the button with the money already in their wallet. Their
    -- session passed every check when the payment started.
    v_prev_sub := current_setting('request.jwt.claim.sub', true);
    v_prev_claims := current_setting('request.jwt.claims', true);
    perform set_config('request.jwt.claim.sub', v_intent.profile_id::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_intent.profile_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
    begin
      if v_intent.purpose = 'checkout' then
        v_outcome := jsonb_build_object('order_ids', to_jsonb(public.place_order(
          v_intent.payload->'items', v_intent.payload->>'delivery_speed', v_intent.payload->>'address',
          v_intent.payload->>'phone', v_intent.amount, nullif(v_intent.payload->>'coupon_code', ''))));
      else
        perform public.subscribe_plan(v_intent.payload->>'plan');
        if v_card is not null then
          update public.subscriptions set card_id = v_card where profile_id = v_intent.profile_id and plan = v_intent.payload->>'plan';
        end if;
        v_outcome := jsonb_build_object('plan', v_intent.payload->>'plan');
      end if;
    exception when others then
      v_outcome := jsonb_build_object('error', sqlerrm);
    end;
    perform set_config('request.jwt.claim.sub', coalesce(v_prev_sub, ''), true);
    perform set_config('request.jwt.claims', coalesce(v_prev_claims, ''), true);
  end if;

  update public.payment_intents set outcome = v_outcome where id = v_intent.id;
  if v_outcome ? 'error' then
    perform public.notify(v_intent.profile_id, 'payment', 'Your payment is in your wallet',
      v_amount || ' arrived, but we could not ' || case v_intent.purpose when 'checkout' then 'place your order' else 'change your plan' end ||
      ': ' || (v_outcome->>'error') || '. Nothing is lost; you can pay from your wallet.', 'wallet', null);
  elsif v_intent.purpose = 'checkout' then
    perform public.notify(v_intent.profile_id, 'order', 'Order placed', 'Paid ' || v_amount || ' by card.', 'orders', null);
  end if;
  return jsonb_build_object('credited', true, 'status', 'success', 'outcome', v_outcome);
end;
$$;

-- The old entry point keeps its contract for anything still calling it.
create or replace function public.credit_topup(p_reference text, p_amount_kobo bigint)
returns boolean language sql security definer set search_path = public as $$
  select (public.settle_payment(p_reference, p_amount_kobo, null)->>'credited')::boolean;
$$;

-- Service role only: Paystack refused or never took the money. A declined
-- renewal is tried from the wallet straight away.
create function public.fail_payment(p_reference text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_intent public.payment_intents;
begin
  update public.payment_intents set status = 'failed', outcome = jsonb_build_object('error', coalesce(nullif(trim(p_reason), ''), 'declined'))
  where reference = p_reference and status = 'pending'
  returning * into v_intent;
  if v_intent.id is not null and v_intent.purpose = 'renewal' then
    perform private.renew_from_wallet(v_intent.profile_id, 'declined');
  end if;
end;
$$;

-- What paystack-charge needs to charge a saved card for one renewal.
create function public.renewal_charge(p_reference text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('reference', i.reference, 'amount', i.amount, 'status', i.status,
    'authorization_code', c.authorization_code, 'email', c.email)
  from public.payment_intents i join public.payment_cards c on c.id = i.card_id
  where i.reference = p_reference and i.purpose = 'renewal';
$$;

revoke all on function public.settle_payment(text, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.credit_topup(text, bigint) from public, anon, authenticated;
revoke all on function public.fail_payment(text, text) from public, anon, authenticated;
revoke all on function public.renewal_charge(text) from public, anon, authenticated;
grant execute on function public.settle_payment(text, bigint, jsonb) to service_role;
grant execute on function public.credit_topup(text, bigint) to service_role;
grant execute on function public.fail_payment(text, text) to service_role;
grant execute on function public.renewal_charge(text) to service_role;
revoke all on function public.remove_payment_card(uuid) from public, anon;
revoke all on function public.set_plan_card(uuid) from public, anon;
grant execute on function public.remove_payment_card(uuid) to authenticated;
grant execute on function public.set_plan_card(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Confirmed bank accounts and automatic payouts
-- ---------------------------------------------------------------------------

alter table public.payout_accounts
  add column bank_code text,
  -- Paystack's transfer recipient, created when the account was confirmed.
  add column recipient_code text,
  add column verified_at timestamptz;

-- People may still type their bank details in; only the server can mark an
-- account confirmed, and changing it by hand clears the confirmation.
revoke insert, update on public.payout_accounts from authenticated;
grant insert (profile_id, bank_name, account_number, account_name, updated_at) on public.payout_accounts to authenticated;
grant update (bank_name, account_number, account_name, updated_at) on public.payout_accounts to authenticated;

-- Not security definer, so current_user is whoever is writing: a person
-- through the API is 'authenticated'; the confirming Edge Function is not.
create function private.unconfirm_changed_payout_account()
returns trigger language plpgsql as $$
begin
  if current_user = 'authenticated'
     and (new.bank_name, new.account_number, new.account_name) is distinct from (old.bank_name, old.account_number, old.account_name) then
    new.bank_code := null;
    new.recipient_code := null;
    new.verified_at := null;
  end if;
  return new;
end;
$$;
create trigger payout_accounts_unconfirm before update on public.payout_accounts
  for each row execute function private.unconfirm_changed_payout_account();

alter table public.withdrawals
  add column recipient_code text,
  add column transfer_reference text unique,
  -- queued: asked of Paystack; sent: Paystack accepted it; failed: back with staff.
  add column transfer_status text check (transfer_status in ('queued', 'sent', 'failed')),
  add column transfer_code text,
  add column failure_reason text,
  add column transfer_requested_at timestamptz;

-- Whether finance has switched automatic payouts on, and up to how much.
create function public.payout_policy()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.staff_can('finance') then raise exception 'admins only'; end if;
  return jsonb_build_object(
    'enabled', coalesce((select value from private.settings where key = 'payouts_auto') = 'on', false),
    'max', coalesce((select value::integer from private.settings where key = 'payouts_auto_max'), 200000),
    'configured', exists(select 1 from private.settings where key = 'paystack_payout_url')
      and exists(select 1 from private.settings where key = 'paystack_hook_secret'));
end;
$$;

create function public.admin_set_payout_policy(p_enabled boolean, p_max integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.staff_can('finance') then raise exception 'admins only'; end if;
  if p_enabled is null or p_max is null or p_max not between 1000 and 10000000 then raise exception 'invalid payout policy'; end if;
  insert into private.settings values ('payouts_auto', case when p_enabled then 'on' else 'off' end)
  on conflict (key) do update set value = excluded.value;
  insert into private.settings values ('payouts_auto_max', p_max::text)
  on conflict (key) do update set value = excluded.value;
  insert into public.admin_actions(actor_id, action, target_id, detail)
  values (auth.uid(), 'set_payout_policy', null, jsonb_build_object('enabled', p_enabled, 'max', p_max));
end;
$$;

-- Decides, as a withdrawal is requested, whether Paystack can send it.
-- Runs after withdrawals_guard (triggers fire in name order), so a risk
-- alert that guard raised is already visible here.
create function private.queue_payout()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_account public.payout_accounts;
begin
  if coalesce((select value from private.settings where key = 'payouts_auto'), 'off') <> 'on'
     or not exists(select 1 from private.settings where key = 'paystack_payout_url')
     or not exists(select 1 from private.settings where key = 'paystack_hook_secret') then
    return new;
  end if;
  if new.amount > coalesce((select value::integer from private.settings where key = 'payouts_auto_max'), 200000) then return new; end if;
  select * into v_account from public.payout_accounts where profile_id = new.profile_id;
  if v_account.recipient_code is null or v_account.account_number <> new.account_number then return new; end if;
  if exists(select 1 from public.risk_alerts where profile_id = new.profile_id and status = 'open' and severity = 'high') then return new; end if;
  new.recipient_code := v_account.recipient_code;
  new.transfer_reference := 'fw_wd_' || replace(new.id::text, '-', '');
  new.transfer_status := 'queued';
  new.transfer_requested_at := now();
  return new;
end;
$$;
create trigger withdrawals_queue_payout before insert on public.withdrawals
  for each row execute function private.queue_payout();

-- pg_net sends only once the transaction commits, so a withdrawal that is
-- rolled back is never paid.
create function private.request_payout(p_withdrawal_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := (select value from private.settings where key = 'paystack_payout_url'),
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-paystack-hook-secret', (select value from private.settings where key = 'paystack_hook_secret')),
    body := jsonb_build_object('withdrawal_id', p_withdrawal_id));
exception when others then
  -- Left queued; finance can send it back to the manual queue after an hour.
  raise warning 'payout request failed: %', sqlerrm;
end;
$$;
revoke all on function private.request_payout(uuid) from public, anon, authenticated;

create function private.send_queued_payout()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.transfer_status = 'queued' then perform private.request_payout(new.id); end if;
  return new;
end;
$$;
create trigger withdrawals_send_payout after insert on public.withdrawals
  for each row execute function private.send_queued_payout();

-- Service role only, from paystack-payout and paystack-webhook.
-- p_outcome: 'sent' (Paystack accepted it), 'success', 'failed' or 'reversed'.
create function public.settle_withdrawal_transfer(p_reference text, p_outcome text, p_transfer_code text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_w public.withdrawals;
begin
  select * into v_w from public.withdrawals where transfer_reference = p_reference for update;
  if v_w.id is null then raise exception 'unknown transfer'; end if;
  if p_outcome = 'sent' then
    if v_w.status = 'requested' and v_w.transfer_status = 'queued' then
      update public.withdrawals set transfer_status = 'sent', transfer_code = coalesce(p_transfer_code, transfer_code) where id = v_w.id;
    end if;
  elsif p_outcome = 'success' then
    if v_w.status = 'paid' then return; end if;
    if v_w.status <> 'requested' then raise exception 'withdrawal already processed'; end if;
    update public.withdrawals
    set status = 'paid', transfer_status = 'sent', transfer_code = coalesce(p_transfer_code, transfer_code),
        processed_at = now(), note = 'Sent automatically by Paystack'
    where id = v_w.id;
    perform public.notify(v_w.profile_id, 'payment', 'Withdrawal sent',
      '₦' || to_char(v_w.amount, 'FM999,999,999') || ' to ' || v_w.bank_name || ' ···' || right(v_w.account_number, 4), 'wallet', null);
  elsif p_outcome in ('failed', 'reversed') then
    -- The money stays out of the wallet and the withdrawal goes back to
    -- finance, who can try again or reverse it to the wallet.
    if v_w.status = 'rejected' or (v_w.transfer_status = 'failed' and v_w.status = 'requested') then return; end if;
    update public.withdrawals
    set status = 'requested', transfer_status = 'failed', processed_at = null,
        failure_reason = coalesce(nullif(trim(p_reason), ''), p_outcome),
        note = case when v_w.status = 'paid' then 'Paystack reversed the transfer' else note end
    where id = v_w.id;
    perform private.notify_staff('finance', 'payment', 'An automatic payout ' || case p_outcome when 'reversed' then 'was reversed' else 'failed' end,
      '₦' || to_char(v_w.amount, 'FM999,999,999') || ' to ' || v_w.bank_name || ' · ' || coalesce(nullif(trim(p_reason), ''), p_outcome),
      'admin_withdrawal', v_w.id::text);
  else
    raise exception 'invalid outcome';
  end if;
end;
$$;

-- Finance staff: try Paystack again after a failure (a new reference, since
-- Paystack refuses a reused one), or take a stuck one back by hand.
create function public.admin_retry_payout(p_withdrawal_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_w public.withdrawals; v_account public.payout_accounts;
begin
  if not public.staff_can('finance') then raise exception 'admins only'; end if;
  select * into v_w from public.withdrawals where id = p_withdrawal_id for update;
  if v_w.id is null then raise exception 'withdrawal not found'; end if;
  if v_w.status <> 'requested' or v_w.transfer_status in ('queued', 'sent') then
    raise exception 'payout in progress';
  end if;
  select * into v_account from public.payout_accounts where profile_id = v_w.profile_id;
  if v_account.recipient_code is null or v_account.account_number <> v_w.account_number then raise exception 'payout account not confirmed'; end if;
  if not exists(select 1 from private.settings where key = 'paystack_payout_url') then raise exception 'automatic payouts not configured'; end if;
  update public.withdrawals
  set recipient_code = v_account.recipient_code, transfer_status = 'queued', failure_reason = null, transfer_requested_at = now(),
      transfer_reference = 'fw_wd_' || replace(v_w.id::text, '-', '') || '_' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISS')
  where id = v_w.id;
  insert into public.admin_actions(actor_id, action, target_id, detail)
  values (auth.uid(), 'retry_payout', v_w.profile_id, jsonb_build_object('withdrawal', v_w.id, 'amount', v_w.amount));
  perform private.request_payout(v_w.id);
end;
$$;

create function public.admin_requeue_payout(p_withdrawal_id uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_w public.withdrawals;
begin
  if not public.staff_can('finance') then raise exception 'admins only'; end if;
  if char_length(trim(coalesce(p_note, ''))) < 3 then raise exception 'reason required'; end if;
  select * into v_w from public.withdrawals where id = p_withdrawal_id for update;
  if v_w.id is null then raise exception 'withdrawal not found'; end if;
  if v_w.status <> 'requested' or v_w.transfer_status not in ('queued', 'sent') then raise exception 'withdrawal already processed'; end if;
  if v_w.transfer_requested_at > now() - interval '1 hour' then raise exception 'payout in progress'; end if;
  update public.withdrawals set transfer_status = 'failed', failure_reason = 'Taken back by staff: ' || trim(p_note) where id = v_w.id;
  insert into public.admin_actions(actor_id, action, target_id, detail)
  values (auth.uid(), 'requeue_payout', v_w.profile_id, jsonb_build_object('withdrawal', v_w.id, 'note', trim(p_note)));
end;
$$;

-- Staff cannot settle by hand what Paystack is still sending.
create or replace function public.admin_process_withdrawal(p_withdrawal_id uuid, p_paid boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_w public.withdrawals;
begin
  if not public.staff_can('finance') then raise exception 'admins only'; end if;
  select * into v_w from public.withdrawals where id = p_withdrawal_id for update;
  if v_w is null then raise exception 'withdrawal not found'; end if;
  if v_w.status <> 'requested' then raise exception 'withdrawal already processed'; end if;
  if v_w.transfer_status in ('queued', 'sent') then raise exception 'payout in progress'; end if;

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

revoke all on function public.settle_withdrawal_transfer(text, text, text, text) from public, anon, authenticated;
grant execute on function public.settle_withdrawal_transfer(text, text, text, text) to service_role;
revoke all on function public.payout_policy() from public, anon;
revoke all on function public.admin_set_payout_policy(boolean, integer) from public, anon;
revoke all on function public.admin_retry_payout(uuid) from public, anon;
revoke all on function public.admin_requeue_payout(uuid, text) from public, anon;
grant execute on function public.payout_policy() to authenticated;
grant execute on function public.admin_set_payout_policy(boolean, integer) to authenticated;
grant execute on function public.admin_retry_payout(uuid) to authenticated;
grant execute on function public.admin_requeue_payout(uuid, text) to authenticated;
