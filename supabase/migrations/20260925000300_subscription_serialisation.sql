-- One upgrade, one charge.
--
-- subscribe_plan read the current plan before it took the wallet lock. Two
-- taps on "Upgrade to Pro" both read Free, then queued on the lock one after
-- the other, and each charged a month. The upsert left one subscription, so
-- the second month's money was simply gone.
--
-- The plan is now read after the locks are held, so the second request finds
-- the first one's upgrade and does nothing. The locks are taken in the order
-- renew_subscriptions takes them, the subscription row and then the wallet,
-- so a renewal and an upgrade cannot deadlock.

create or replace function public.subscribe_plan(p_plan text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_plan public.subscription_plans;
  v_current text;
  v_balance bigint;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_plan from public.subscription_plans where id = p_plan;
  if v_plan is null then
    raise exception 'plan not found';
  end if;

  -- A first subscription has no row to lock; the wallet lock below still
  -- serialises it, and the read after it sees whichever request finished first.
  perform 1 from public.subscriptions where profile_id = auth.uid() for update;
  v_balance := private.locked_balance(auth.uid());

  select plan into v_current from public.subscriptions where profile_id = auth.uid();
  if v_current = p_plan then
    return;
  end if;

  if v_plan.price > 0 then
    if v_balance < v_plan.price then
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
