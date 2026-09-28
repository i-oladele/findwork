-- Money rules for goods sold by sellers, and for disputes.
--
-- Opening the catalog to sellers (20260921020000) let money be created or
-- paid twice:
--
--   - A negative price made an order credit the buyer's spendable balance.
--   - Marking an order delivered twice paid the seller twice, and delivery
--     ignored an open dispute.
--   - A return after delivery refunded the customer without taking back the
--     seller's payout, and subtracted the spent escrow a second time.
--   - Two disputes could open on the same booking or order at once, or one
--     could open on money that was being refunded at that moment.
--   - Checkout validated the balance against one set of prices and charged
--     another if a seller changed a price while it waited for the wallet
--     lock; a product repeated in the cart dodged the stock check.
--   - The app showed one delivery fee; the server charges one per seller.
--
-- Settlement is now idempotent under the order's row lock, with unique
-- ledger indexes behind it. Disputes lock what they are about. Checkout
-- locks the products it sells and charges only the total the customer was
-- quoted.
--
-- Historical ledger rows are never rewritten. If existing data already
-- breaks these rules, the migration stops before changing anything, so the
-- affected accounts can be reconciled by hand first.

do $$
declare
  v_ids text;
begin
  select string_agg(id, ', ') into v_ids from public.products where price <= 0;
  if v_ids is not null then
    raise exception 'Products priced at or below zero: %. Reprice or remove them, and check the orders they were in.', v_ids;
  end if;

  select string_agg(distinct o.id::text, ', ') into v_ids
  from public.orders o left join public.order_items oi on oi.order_id = o.id
  where o.total <= 0 or oi.price <= 0;
  if v_ids is not null then
    raise exception 'Orders containing a price at or below zero: %. Reconcile the buyer''s ledger first.', v_ids;
  end if;

  select string_agg(o.id::text, ', ') into v_ids
  from public.orders o
  where (select coalesce(sum(w.escrow_delta), 0) from public.wallet_transactions w
         where w.order_id = o.id and w.profile_id = o.customer_id)
    <> case when o.seller_id is not null and o.status in ('placed', 'dispatched') then o.total else 0 end;
  if v_ids is not null then
    raise exception 'Orders whose escrow does not reconcile: %. Correct the ledger before applying this.', v_ids;
  end if;

  select string_agg(order_id::text, ', ') into v_ids from (
    select order_id from public.wallet_transactions
    where order_id is not null and kind = 'release' and balance_delta > 0
    group by order_id having count(*) > 1
    union
    select order_id from public.wallet_transactions
    where order_id is not null and kind = 'refund'
    group by order_id having count(*) > 1
  ) paid_twice;
  if v_ids is not null then
    raise exception 'Orders paid out or refunded more than once: %. Reverse the duplicates first.', v_ids;
  end if;

  select string_agg(ref_type || ' ' || ref_id, ', ') into v_ids from (
    select ref_type, ref_id from public.disputes where status = 'open'
    group by ref_type, ref_id having count(*) > 1
  ) doubled;
  if v_ids is not null then
    raise exception 'More than one open dispute on: %. Resolve all but one first.', v_ids;
  end if;
end;
$$;

alter table public.products add constraint products_price_positive check (price > 0);
alter table public.orders add constraint orders_total_positive check (total > 0);
alter table public.orders add constraint orders_escrow_nonnegative check (escrow_held >= 0);
alter table public.order_items add constraint order_items_price_positive check (price > 0);

-- Old delivery code consumed the ledger hold but retained the snapshot value.
update public.orders set escrow_held = 0 where status in ('delivered', 'returned', 'cancelled');

create unique index order_one_seller_payout on public.wallet_transactions(order_id)
  where order_id is not null and kind = 'release' and balance_delta > 0;
create unique index order_one_refund on public.wallet_transactions(order_id)
  where order_id is not null and kind = 'refund';
create unique index disputes_one_open_reference on public.disputes(ref_type, ref_id)
  where status = 'open';

-- The same normalized cart feeds quoting, stock reservation, and charging.
create function private.normalized_cart(p_items jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
declare v_items jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'cart is empty'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'cart is empty'; end if;
  if jsonb_array_length(p_items) > 100 then raise exception 'cart too large'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as x(product_id text, qty integer)
    where x.product_id is null or x.qty is null or x.qty not between 1 and 99
  ) then raise exception 'invalid quantity'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as x(product_id text, qty integer)
    group by x.product_id having sum(x.qty) > 99
  ) then raise exception 'invalid quantity'; end if;
  select jsonb_agg(jsonb_build_object('product_id', product_id, 'qty', qty) order by product_id)
  into v_items from (
    select x.product_id, sum(x.qty)::integer as qty
    from jsonb_to_recordset(p_items) as x(product_id text, qty integer) group by x.product_id
  ) items;
  return v_items;
end;
$$;

-- One statement builds the quote from a consistent catalog snapshot.
create function public.checkout_quote(p_items jsonb, p_delivery_speed text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_items jsonb := private.normalized_cart(p_items);
  v_delivery_fee integer;
  v_quote jsonb;
  v_missing boolean;
  v_stock boolean;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_delivery_speed is null or p_delivery_speed not in ('same-day', 'standard') then
    raise exception 'invalid delivery speed';
  end if;
  v_delivery_fee := case p_delivery_speed when 'same-day' then 1800 else 1200 end;
  select
    bool_or(p.id is null or p.status <> 'live' or p.price <= 0
      or (p.seller_id is not null and (seller.id is null or seller.deleted_at is not null))),
    bool_or(p.stock is not null and p.stock < x.qty),
    jsonb_build_object(
      'items_total', sum(p.price::bigint * x.qty),
      'seller_count', count(distinct coalesce(p.seller_id::text, 'findwork')),
      'delivery_fee', count(distinct coalesce(p.seller_id::text, 'findwork')) * v_delivery_fee,
      'total', sum(p.price::bigint * x.qty) + count(distinct coalesce(p.seller_id::text, 'findwork')) * v_delivery_fee)
  into v_missing, v_stock, v_quote
  from jsonb_to_recordset(v_items) as x(product_id text, qty integer)
  left join public.products p on p.id = x.product_id
  left join public.profiles seller on seller.id = p.seller_id;
  if v_missing then raise exception 'product not found'; end if;
  if v_stock then raise exception 'not enough stock'; end if;
  if (v_quote->>'total')::bigint not between 1 and 2147483647 then raise exception 'invalid order total'; end if;
  return v_quote;
end;
$$;

-- p_expected_total is the quote the customer was shown. It defaults to null
-- only so that an app built before this gets "your total changed" rather
-- than "function not found"; a missing total is never charged.
drop function public.place_order(jsonb, text, text, text);

create or replace function public.place_order(p_items jsonb, p_delivery_speed text, p_address text, p_phone text, p_expected_total integer default null)
returns uuid[]
language plpgsql
security definer set search_path = public
as $$
declare
  v_delivery_fee integer;
  v_total_due integer := 0;
  v_items jsonb;
  v_quote jsonb;
  v_group record;
  v_order_id uuid;
  v_items_total integer;
  v_order_total integer;
  v_order_ids uuid[] := '{}';
begin
  if p_delivery_speed not in ('same-day', 'standard') then
    raise exception 'invalid delivery speed';
  end if;
  if coalesce(trim(p_address), '') = '' then
    raise exception 'address required';
  end if;
  v_items := private.normalized_cart(p_items);
  -- Product locks precede the wallet lock. Sellers cannot change the prices,
  -- visibility or stock used by any later statement until this order commits.
  perform p.id from public.products p
  join jsonb_to_recordset(v_items) as x(product_id text, qty integer) on x.product_id = p.id
  order by p.id for update of p;
  -- The quote, the balance check, the orders, the item snapshots and the
  -- debits below all read the same locked rows.
  v_quote := public.checkout_quote(v_items, p_delivery_speed);
  v_total_due := (v_quote->>'total')::integer;
  if p_expected_total is null or p_expected_total <> v_total_due then
    raise exception 'checkout_total_changed';
  end if;
  v_delivery_fee := case p_delivery_speed when 'same-day' then 1800 else 1200 end;

  if private.locked_balance(auth.uid()) < v_total_due then
    raise exception 'insufficient_balance';
  end if;

  for v_group in
    select p.seller_id, max(pp.business_name) as seller_name, sum(p.price * x.qty)::integer as items_total
    from jsonb_to_recordset(v_items) as x(product_id text, qty integer)
    join public.products p on p.id = x.product_id
    left join public.provider_profiles pp on pp.id = p.seller_id
    group by p.seller_id
  loop
    v_items_total := v_group.items_total;
    v_order_total := v_items_total + v_delivery_fee;

    insert into public.orders (
      customer_id, seller_id, seller_name, total, items_total, delivery_speed, delivery_fee,
      delivery_address, contact_phone, escrow_held
    )
    values (
      auth.uid(), v_group.seller_id, v_group.seller_name, v_order_total, v_items_total, p_delivery_speed,
      v_delivery_fee, trim(p_address), nullif(trim(p_phone), ''),
      -- Only a real seller's money is held; the first-party catalog has
      -- nobody waiting to be paid.
      case when v_group.seller_id is null then 0 else v_order_total end
    )
    returning id into v_order_id;

    insert into public.order_items (order_id, product_id, name, price, qty)
    select v_order_id, p.id, p.name, p.price, x.qty
    from jsonb_to_recordset(v_items) as x(product_id text, qty integer)
    join public.products p on p.id = x.product_id
    where p.seller_id is not distinct from v_group.seller_id;

    update public.products p
    set stock = p.stock - x.qty
    from jsonb_to_recordset(v_items) as x(product_id text, qty integer)
    where p.id = x.product_id and p.stock is not null and p.seller_id is not distinct from v_group.seller_id;

    insert into public.wallet_transactions (profile_id, label, kind, balance_delta, escrow_delta, order_id)
    values (
      auth.uid(),
      'Order #' || upper(left(v_order_id::text, 8)) || coalesce(' · ' || v_group.seller_name, ''),
      'order', -v_order_total,
      case when v_group.seller_id is null then 0 else v_order_total end,
      v_order_id
    );

    if v_group.seller_id is null then
      perform private.notify_admins('order', 'New order to fulfil',
        '#' || upper(left(v_order_id::text, 8)) || ' · ₦' || to_char(v_order_total, 'FM999,999,999'),
        'admin_order', v_order_id::text);
    else
      perform public.notify(v_group.seller_id, 'order', 'New order',
        '₦' || to_char(v_items_total, 'FM999,999,999') || ' · the money is in escrow',
        'seller_order', v_order_id::text);
    end if;

    v_order_ids := v_order_ids || v_order_id;
  end loop;

  return v_order_ids;
end;
$$;

create or replace function private.release_order(p_order public.orders)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_order public.orders;
  v_rate numeric;
  v_commission integer;
begin
  select * into v_order from public.orders where id = p_order.id for update;
  if not found then raise exception 'order not found'; end if;
  if v_order.status = 'delivered' then return; end if;
  if v_order.status not in ('placed', 'dispatched') then raise exception 'order is closed'; end if;
  if private.open_dispute_exists('order', v_order.id::text) then raise exception 'dispute_open'; end if;
  p_order := v_order;
  if p_order.seller_id is not null and p_order.escrow_held <> p_order.total then
    raise exception 'invalid escrow balance';
  end if;
  update public.orders set status = 'delivered', escrow_held = 0, updated_at = now() where id = p_order.id;

  if p_order.seller_id is null then
    return;
  end if;

  v_rate := private.commission_rate(p_order.seller_id);
  v_commission := round(p_order.items_total * v_rate);

  update public.orders set commission = v_commission where id = p_order.id;

  insert into public.wallet_transactions (profile_id, label, kind, escrow_delta, order_id)
  values (p_order.customer_id, 'Released to ' || coalesce(p_order.seller_name, 'seller'), 'release',
    -p_order.escrow_held, p_order.id);

  -- The seller is paid for the goods; the delivery fee covers the courier.
  insert into public.wallet_transactions (profile_id, label, kind, balance_delta, order_id)
  values (p_order.seller_id, 'Sale · order #' || upper(left(p_order.id::text, 8)), 'release',
    p_order.items_total, p_order.id);

  if v_commission > 0 then
    insert into public.wallet_transactions (profile_id, label, kind, balance_delta, order_id)
    values (p_order.seller_id, 'FindWork fee · ' || round(v_rate * 100) || '%', 'fee', -v_commission, p_order.id);
  end if;

  perform public.notify(p_order.seller_id, 'payment', 'You have been paid',
    '₦' || to_char(p_order.items_total - v_commission, 'FM999,999,999') || ' for order #' ||
      upper(left(p_order.id::text, 8)), 'wallet', null);
end;
$$;

create or replace function public.admin_set_order_status(p_order_id uuid, p_status text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_order public.orders;
begin
  if not public.is_admin() then
    raise exception 'admins only';
  end if;
  if p_status is null or p_status not in ('dispatched', 'delivered') then
    raise exception 'invalid status';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order is null then
    raise exception 'order not found';
  end if;
  if v_order.status = p_status then return; end if;
  if private.open_dispute_exists('order', p_order_id::text) then raise exception 'dispute_open'; end if;
  if v_order.status not in ('placed', 'dispatched') then
    raise exception 'order is closed';
  end if;

  if p_status = 'dispatched' then
    update public.orders set status = 'dispatched', dispatched_at = now(), updated_at = now() where id = p_order_id;
  else
    perform private.release_order(v_order);
  end if;

  perform public.notify(v_order.customer_id, 'order',
    case p_status when 'dispatched' then 'Your order is on the way' else 'Your order was delivered' end,
    'Order #' || upper(left(p_order_id::text, 8)), 'order', p_order_id::text);
end;
$$;

create or replace function private.auto_release_orders(p_days integer default 7)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_order public.orders;
  v_count integer := 0;
begin
  for v_order in
    select * from public.orders
    where status = 'dispatched'
      and seller_id is not null
      and dispatched_at < now() - make_interval(days => p_days)
      and not private.open_dispute_exists('order', id::text)
    for update
  loop
    -- Recheck after taking the row lock: a dispute may have committed while
    -- this worker waited for it.
    if private.open_dispute_exists('order', v_order.id::text) then continue; end if;
    perform private.release_order(v_order);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function private.refund_order(p_order public.orders, p_status text, p_label text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_order public.orders;
  v_recovery integer;
begin
  select * into v_order from public.orders where id = p_order.id for update;
  if not found then raise exception 'order not found'; end if;
  if v_order.status in ('returned', 'cancelled') then raise exception 'order is closed'; end if;
  if p_status not in ('returned', 'cancelled') then raise exception 'invalid status'; end if;
  if private.open_dispute_exists('order', v_order.id::text) then raise exception 'dispute_open'; end if;
  if v_order.seller_id is not null and v_order.status = 'delivered' then
    -- Return the seller's net proceeds; FindWork gives up the original
    -- commission and delivery fee. Never create an unfunded seller debt.
    v_recovery := v_order.items_total - v_order.commission;
    if private.locked_balance(v_order.seller_id) < v_recovery then
      raise exception 'seller_refund_insufficient_balance';
    end if;
    insert into public.wallet_transactions(profile_id, label, kind, balance_delta, order_id)
    values (v_order.seller_id, 'Sale reversed · order #' || upper(left(v_order.id::text, 8)),
      'adjustment', -v_recovery, v_order.id);
  end if;
  update public.orders set status = p_status, updated_at = now(), escrow_held = 0 where id = v_order.id;
  insert into public.wallet_transactions(profile_id, label, kind, balance_delta, escrow_delta, order_id)
  values (v_order.customer_id, p_label, 'refund', v_order.total, -v_order.escrow_held, v_order.id);
  -- Only unshipped stock is automatically returned to sale. Delivered goods
  -- require a separate inspection/restock decision by the seller.
  if v_order.status = 'placed' then
    update public.products p set stock = p.stock + quantities.qty
    from (select product_id, sum(qty)::integer qty from public.order_items
          where order_id = v_order.id group by product_id) quantities
    where p.id = quantities.product_id and p.stock is not null;
  end if;
  if v_order.seller_id is not null then
    perform public.notify(v_order.seller_id, 'dispute', 'Order refunded',
      '#' || upper(left(v_order.id::text, 8)) || ' was refunded to the customer', 'seller_order', v_order.id::text);
  end if;
end;
$$;

create or replace function public.cancel_order(p_order_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_order public.orders;
  v_other uuid;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order is null then
    raise exception 'order not found';
  end if;
  if auth.uid() not in (v_order.customer_id, coalesce(v_order.seller_id, v_order.customer_id)) then
    raise exception 'not your order';
  end if;
  if v_order.status <> 'placed' then
    raise exception 'order already dispatched';
  end if;
  if private.open_dispute_exists('order', p_order_id::text) then
    raise exception 'dispute_open';
  end if;

  perform private.refund_order(v_order, 'cancelled', 'Refund · order #' || upper(left(p_order_id::text, 8)));

  v_other := case when auth.uid() = v_order.customer_id then v_order.seller_id else v_order.customer_id end;
  if v_other is not null then
    perform public.notify(v_other, 'order', 'Order cancelled',
      '#' || upper(left(p_order_id::text, 8)) || ' · the customer has been refunded', 'order', p_order_id::text);
  end if;
end;
$$;

create or replace function public.open_dispute(
  p_ref_type text,
  p_ref_id uuid,
  p_reason text,
  p_evidence_paths text[] default '{}'
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_booking public.bookings;
  v_order public.orders;
  v_against uuid;
  v_label text;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'reason required';
  end if;

  if p_ref_type = 'booking' then
    select * into v_booking from public.bookings where id = p_ref_id for update;
    if v_booking is null or auth.uid() not in (v_booking.customer_id, v_booking.provider_id) then
      raise exception 'booking not found';
    end if;
    if v_booking.status not in ('pending', 'active') then
      raise exception 'booking is closed';
    end if;
    v_against := case when auth.uid() = v_booking.customer_id then v_booking.provider_id else v_booking.customer_id end;
    v_label := v_booking.service;
  elsif p_ref_type = 'order' then
    select * into v_order from public.orders where id = p_ref_id for update;
    if v_order is null or auth.uid() not in (v_order.customer_id, coalesce(v_order.seller_id, v_order.customer_id)) then
      raise exception 'order not found';
    end if;
    if v_order.status in ('cancelled', 'returned') then
      raise exception 'order is closed';
    end if;
    v_against := case when auth.uid() = v_order.customer_id then v_order.seller_id else v_order.customer_id end;
    v_label := 'Order #' || upper(left(p_ref_id::text, 8));
  else
    raise exception 'invalid dispute type';
  end if;

  if private.open_dispute_exists(p_ref_type, p_ref_id::text) then
    raise exception 'dispute_open';
  end if;

  if exists (
    select 1 from unnest(p_evidence_paths) as p(path)
    where split_part(path, '/', 1) <> auth.uid()::text
  ) then
    raise exception 'invalid evidence path';
  end if;

  insert into public.disputes (raised_by, against_id, ref_id, ref_type, reason, evidence_paths)
  values (auth.uid(), v_against, p_ref_id::text, p_ref_type, trim(p_reason), coalesce(p_evidence_paths, '{}'))
  returning id into v_id;

  if v_against is not null then
    perform public.notify(v_against, 'dispute', 'A dispute was opened', v_label || ' · the payment is on hold', 'dispute', v_id::text);
  end if;
  perform private.notify_admins('dispute', 'New dispute', v_label, 'admin_dispute', v_id::text);

  return v_id;
end;
$$;

create or replace function public.resolve_dispute(p_dispute_id uuid, p_outcome text, p_note text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_dispute public.disputes;
  v_booking public.bookings;
  v_order public.orders;
  v_title text;
begin
  if not public.is_admin() then
    raise exception 'admins only';
  end if;
  if p_outcome is null or p_outcome not in ('release', 'refund', 'dismissed') then
    raise exception 'invalid outcome';
  end if;

  select * into v_dispute from public.disputes where id = p_dispute_id;
  if v_dispute is null then
    raise exception 'dispute not found';
  end if;
  -- Reference first, dispute second: the same ordering as opening a dispute.
  if v_dispute.ref_type = 'booking' then
    select * into v_booking from public.bookings where id = v_dispute.ref_id::uuid for update;
  else
    select * into v_order from public.orders where id = v_dispute.ref_id::uuid for update;
  end if;
  select * into v_dispute from public.disputes where id = p_dispute_id for update;
  if v_dispute.status <> 'open' then
    raise exception 'dispute already resolved';
  end if;

  update public.disputes
  set status = 'resolved', outcome = p_outcome, resolution_note = nullif(trim(p_note), ''),
      resolved_by = auth.uid(), resolved_at = now()
  where id = p_dispute_id;

  if v_dispute.ref_type = 'booking' then
    select * into v_booking from public.bookings where id = v_dispute.ref_id::uuid for update;
    if p_outcome = 'release' then
      if v_booking.status <> 'active' then
        raise exception 'only an accepted booking can be released';
      end if;
      perform private.release_booking(v_booking);
    elsif p_outcome = 'refund' then
      perform private.refund_booking(v_booking, auth.uid(), 'Refund · dispute on ' || v_booking.service);
    end if;
  else
    select * into v_order from public.orders where id = v_dispute.ref_id::uuid for update;
    if p_outcome = 'refund' then
      perform private.refund_order(v_order, 'returned', 'Refund · order #' || upper(left(v_order.id::text, 8)));
    elsif p_outcome = 'release' then
      if v_order.seller_id is null then
        raise exception 'nothing to release on a FindWork order';
      end if;
      perform private.release_order(v_order);
    end if;
  end if;

  v_title := case p_outcome
    when 'release' then 'Dispute resolved: payment released'
    when 'refund' then 'Dispute resolved: refunded'
    else 'Dispute closed'
  end;

  perform public.notify(v_dispute.raised_by, 'dispute', v_title, coalesce(p_note, ''), 'dispute', p_dispute_id::text);
  if v_dispute.against_id is not null then
    perform public.notify(v_dispute.against_id, 'dispute', v_title, coalesce(p_note, ''), 'dispute', p_dispute_id::text);
  end if;
end;
$$;

create or replace function private.refund_booking(p_booking public.bookings, p_by uuid, p_label text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  select * into p_booking from public.bookings where id = p_booking.id for update;
  if not found or p_booking.status not in ('pending', 'active') then raise exception 'booking is closed'; end if;
  if private.open_dispute_exists('booking', p_booking.id::text) then raise exception 'dispute_open'; end if;
  update public.bookings
  set status = 'cancelled', cancelled_by = p_by, cancelled_at = now()
  where id = p_booking.id;

  insert into public.wallet_transactions (profile_id, label, kind, balance_delta, escrow_delta, booking_id)
  values (p_booking.customer_id, p_label, 'refund', p_booking.escrow_held, -p_booking.escrow_held, p_booking.id);
end;
$$;

create or replace function private.release_booking(p_booking public.bookings)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_rate numeric := private.commission_rate(p_booking.provider_id);
  v_commission integer := round(p_booking.price * v_rate);
begin
  select * into p_booking from public.bookings where id = p_booking.id for update;
  if not found or p_booking.status not in ('active') then raise exception 'booking is closed'; end if;
  if private.open_dispute_exists('booking', p_booking.id::text) then raise exception 'dispute_open'; end if;
  update public.bookings
  set status = 'done', commission = v_commission
  where id = p_booking.id;

  insert into public.wallet_transactions (profile_id, label, kind, escrow_delta, booking_id)
  values (p_booking.customer_id, 'Released to ' || p_booking.provider_name, 'release', -p_booking.escrow_held, p_booking.id);

  insert into public.wallet_transactions (profile_id, label, kind, balance_delta, booking_id)
  values (p_booking.provider_id, 'Payout · ' || p_booking.service, 'release', p_booking.price, p_booking.id);

  if v_commission > 0 then
    insert into public.wallet_transactions (profile_id, label, kind, balance_delta, booking_id)
    values (p_booking.provider_id, 'FindWork fee · ' || round(v_rate * 100) || '%', 'fee', -v_commission, p_booking.id);
  end if;

  update public.provider_profiles set jobs_done = jobs_done + 1 where id = p_booking.provider_id;

  perform public.notify(p_booking.provider_id, 'payment', 'You have been paid',
    p_booking.service || ' · ₦' || to_char(p_booking.price - v_commission, 'FM999,999,999'),
    'wallet', p_booking.id::text);
end;
$$;

revoke execute on function public.checkout_quote(jsonb, text) from public, anon;
grant execute on function public.checkout_quote(jsonb, text) to authenticated;
revoke execute on function public.place_order(jsonb, text, text, text, integer) from public, anon;
grant execute on function public.place_order(jsonb, text, text, text, integer) to authenticated;

