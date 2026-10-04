-- PRD operational reporting. All figures are calculated server-side; the
-- browser never downloads the platform ledger or other users' contact data.
-- Revenue components exclude wallet funding, escrow principal and delivery
-- charges. Seller-order commission reverses on the actual refund date.
create function public.admin_analytics(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_result jsonb;
begin
  if not public.is_admin() or not exists(select 1 from public.profiles where id = auth.uid() and deleted_at is null) then
    raise exception 'admins only';
  end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '366 days' then
    raise exception 'invalid report range';
  end if;
  with ledger as (
    select w.*, b.fee as booking_fee, o.commission as order_commission, o.seller_id, o.items_total
    from public.wallet_transactions w
    left join public.bookings b on b.id = w.booking_id
    left join public.orders o on o.id = w.order_id
    where w.created_at >= p_from and w.created_at < p_to
  ), income as (
    select created_at,
      case
        when kind = 'fee' then -balance_delta::bigint
        when kind = 'release' and booking_id is not null and escrow_delta < 0 then coalesce(booking_fee,0)::bigint
        when kind = 'refund' and order_id is not null and seller_id is not null then -coalesce(order_commission,0)::bigint
        else 0 end as marketplace_fees,
      case when kind = 'subscription' then -balance_delta::bigint else 0 end as subscriptions,
      case when kind = 'course' then -balance_delta::bigint else 0 end as courses,
      case when order_id is not null and seller_id is null then
        case when kind = 'order' then items_total::bigint when kind = 'refund' then -items_total::bigint else 0 end
        else 0 end as catalog_collections
    from ledger
  ), activity as (
    select customer_id as profile_id from public.bookings where created_at >= p_from and created_at < p_to
    union select provider_id from public.bookings where created_at >= p_from and created_at < p_to
    union select customer_id from public.orders where placed_at >= p_from and placed_at < p_to
    union select seller_id from public.orders where placed_at >= p_from and placed_at < p_to and seller_id is not null
    union select sender_id from public.chat_messages where created_at >= p_from and created_at < p_to
    union select profile_id from ledger
    union select provider_id from public.sent_quotes where created_at >= p_from and created_at < p_to
  ), dates as (
    select day::date as day from generate_series(
      (p_from at time zone 'Africa/Lagos')::date::timestamp,
      ((p_to - interval '1 microsecond') at time zone 'Africa/Lagos')::date::timestamp,
      interval '1 day') day
  ), daily_income as (
    select (created_at at time zone 'Africa/Lagos')::date as day,
      sum(marketplace_fees) as marketplace_fees, sum(subscriptions) as subscriptions,
      sum(courses) as courses, sum(catalog_collections) as catalog_collections
    from income group by 1
  ), daily_signups as (
    select (created_at at time zone 'Africa/Lagos')::date as day, count(*) as signups
    from public.profiles where created_at >= p_from and created_at < p_to group by 1
  ), daily_bookings as (
    select (created_at at time zone 'Africa/Lagos')::date as day, count(*) as bookings
    from public.bookings where created_at >= p_from and created_at < p_to group by 1
  ), daily_orders as (
    select (placed_at at time zone 'Africa/Lagos')::date as day, count(*) as orders
    from public.orders where placed_at >= p_from and placed_at < p_to group by 1
  )
  select jsonb_build_object(
    'as_of', now(), 'from', p_from, 'to', p_to,
    'period', jsonb_build_object(
      'marketplace_fees', coalesce((select sum(marketplace_fees) from income),0),
      'subscriptions', coalesce((select sum(subscriptions) from income),0),
      'courses', coalesce((select sum(courses) from income),0),
      'catalog_collections', coalesce((select sum(catalog_collections) from income),0),
      'signups', (select count(*) from public.profiles where created_at >= p_from and created_at < p_to),
      'active_users', (select count(*) from activity),
      'bookings', (select count(*) from public.bookings where created_at >= p_from and created_at < p_to),
      'orders', (select count(*) from public.orders where placed_at >= p_from and placed_at < p_to),
      'messages', (select count(*) from public.chat_messages where created_at >= p_from and created_at < p_to),
      'ledger_entries', (select count(*) from ledger),
      'topups', coalesce((select sum(balance_delta) from ledger where kind = 'topup'),0),
      'customer_refunds', coalesce((select sum(balance_delta) from ledger where kind = 'refund'),0)
    ),
    'current', jsonb_build_object(
      'users', (select count(*) from public.profiles where deleted_at is null),
      'wallet_balances', coalesce((select sum(balance_delta) from public.wallet_transactions),0),
      'escrow_held', coalesce((select sum(escrow_delta) from public.wallet_transactions),0),
      'open_disputes', (select count(*) from public.disputes where status = 'open'),
      'pending_withdrawals', coalesce((select sum(amount) from public.withdrawals where status = 'requested'),0),
      'gateway_refunds_due', coalesce((select sum(amount) from public.payment_intents where status = 'refund_due'),0)
    ),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object(
      'date', d.day, 'marketplace_fees', coalesce(i.marketplace_fees,0), 'subscriptions', coalesce(i.subscriptions,0),
      'courses', coalesce(i.courses,0), 'catalog_collections', coalesce(i.catalog_collections,0),
      'signups', coalesce(s.signups,0), 'bookings', coalesce(b.bookings,0), 'orders', coalesce(o.orders,0)
    ) order by d.day),'[]'::jsonb) from dates d
      left join daily_income i using(day) left join daily_signups s using(day)
      left join daily_bookings b using(day) left join daily_orders o using(day))
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.admin_analytics(timestamptz,timestamptz) from public, anon;
grant execute on function public.admin_analytics(timestamptz,timestamptz) to authenticated;
