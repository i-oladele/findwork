-- PRD Subscription Billing: one in-app reminder per upcoming paid renewal.
create table public.subscription_reminders (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  plan text not null references public.subscription_plans(id),
  renews_at timestamptz not null,
  sent_at timestamptz not null default now(),
  primary key(profile_id, plan, renews_at)
);
alter table public.subscription_reminders enable row level security;
revoke all on public.subscription_reminders from anon, authenticated;

create function private.remind_subscription_renewals()
returns integer language plpgsql security definer set search_path = public as $$
declare v_sub record; v_inserted integer; v_sent integer := 0;
begin
  for v_sub in
    select s.profile_id, s.plan, s.renews_at, p.name, p.price
    from public.subscriptions s
    join public.subscription_plans p on p.id = s.plan
    join public.profiles u on u.id = s.profile_id
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
        ' for ₦' || to_char(v_sub.price, 'FM999,999,999') || '. Keep enough in your wallet or change your plan before renewal.',
        'billing', v_sub.profile_id::text);
      v_sent := v_sent + 1;
    end if;
  end loop;
  return v_sent;
end;
$$;
revoke all on function private.remind_subscription_renewals() from public, anon, authenticated;

-- Hosted pg_cron availability must be verified at deployment. A migration
-- warning is deliberately not treated as proof that scheduling is active.
do $$
begin
  if exists(select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('subscription-renewal-reminders', '0 6 * * *', 'select private.remind_subscription_renewals()');
  else
    raise notice 'Schedule private.remind_subscription_renewals() daily before renew_subscriptions().';
  end if;
end;
$$;
