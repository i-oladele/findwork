-- Sellers list their own goods.
--
-- A business profile already exists for people who sell services, carrying
-- the name, area, verification, rating and plan. Goods reuse it rather than
-- introducing a second kind of seller: a tailor who also sells fabric is one
-- business with one reputation, one plan and one payout account. Nothing
-- about buying changes — the same account switches between the two.
--
-- Money for goods follows bookings: held in escrow at checkout, released
-- when the customer confirms the goods arrived, less the seller's plan
-- commission. Orders from FindWork's own catalog (seller_id null) keep the
-- old behaviour, since there is nobody to pay.

-- ---------------------------------------------------------------------------
-- 1. Products belong to a seller
-- ---------------------------------------------------------------------------

alter table public.products
  add column seller_id uuid references public.provider_profiles (id) on delete cascade,
  add column description text,
  -- null means made to order / unlimited, which is common for fabric sellers.
  add column stock integer check (stock is null or stock >= 0),
  add column status text not null default 'live' check (status in ('draft', 'live', 'hidden')),
  add column photo_urls text[] not null default '{}',
  add column updated_at timestamptz not null default now();

-- New products get an id; the seeded catalog keeps its readable slugs.
alter table public.products alter column id set default gen_random_uuid()::text;

create index products_seller_idx on public.products (seller_id, status);

drop policy "Products are viewable by authenticated users" on public.products;

create policy "Live products, and your own drafts, are visible"
  on public.products for select
  to authenticated
  using (status = 'live' or seller_id = auth.uid() or public.is_admin());

create policy "A seller manages their own products"
  on public.products for all
  to authenticated
  using (seller_id is not null and seller_id = auth.uid())
  with check (seller_id is not null and seller_id = auth.uid());

-- seller_id is set from the caller's own id, never chosen.
revoke insert, update on public.products from anon, authenticated;
grant insert (id, seller_id, name, price, vendor, variant, description, stock, status, photo_urls)
  on public.products to authenticated;
grant update (name, price, variant, description, stock, status, photo_urls, updated_at)
  on public.products to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Orders belong to a seller, and hold escrow
-- ---------------------------------------------------------------------------

alter table public.orders
  add column seller_id uuid references public.provider_profiles (id),
  add column seller_name text,
  add column items_total integer not null default 0,
  add column escrow_held integer not null default 0,
  add column commission integer not null default 0,
  add column dispatched_at timestamptz;

create index orders_seller_idx on public.orders (seller_id, status);

create policy "Sellers see orders for their goods"
  on public.orders for select
  to authenticated
  using (seller_id = auth.uid());

create policy "Sellers see the items in their orders"
  on public.order_items for select
  to authenticated
  using (
    exists (select 1 from public.orders o where o.id = order_items.order_id and o.seller_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 3. Checkout splits the cart by seller
-- ---------------------------------------------------------------------------

drop function public.place_order(jsonb, text, text, text);

-- Returns one order id per seller in the cart, newest first.
create function public.place_order(p_items jsonb, p_delivery_speed text, p_address text, p_phone text)
returns uuid[]
language plpgsql
security definer set search_path = public
as $$
declare
  v_delivery_fee integer;
  v_total_due integer := 0;
  v_bad_qty boolean;
  v_missing boolean;
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
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'cart is empty';
  end if;
  v_delivery_fee := case p_delivery_speed when 'same-day' then 1800 else 1200 end;

  -- Prices and availability come from the catalog, never from the client.
  select
    bool_or(x.qty is null or x.qty < 1 or x.qty > 99),
    bool_or(p.id is null or p.status <> 'live')
  into v_bad_qty, v_missing
  from jsonb_to_recordset(p_items) as x(product_id text, qty integer)
  left join public.products p on p.id = x.product_id;

  if v_bad_qty then
    raise exception 'invalid quantity';
  end if;
  if v_missing then
    raise exception 'product not found';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as x(product_id text, qty integer)
    join public.products p on p.id = x.product_id
    where p.stock is not null and p.stock < x.qty
  ) then
    raise exception 'not enough stock';
  end if;

  -- Each seller is paid separately and ships separately, so each gets an
  -- order of their own. Delivery is charged once per seller.
  select sum(p.price * x.qty) + (count(distinct coalesce(p.seller_id::text, 'findwork')) * v_delivery_fee)
  into v_total_due
  from jsonb_to_recordset(p_items) as x(product_id text, qty integer)
  join public.products p on p.id = x.product_id;

  if private.locked_balance(auth.uid()) < v_total_due then
    raise exception 'insufficient_balance';
  end if;

  for v_group in
    select p.seller_id, max(pp.business_name) as seller_name, sum(p.price * x.qty)::integer as items_total
    from jsonb_to_recordset(p_items) as x(product_id text, qty integer)
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
    from jsonb_to_recordset(p_items) as x(product_id text, qty integer)
    join public.products p on p.id = x.product_id
    where p.seller_id is not distinct from v_group.seller_id;

    update public.products p
    set stock = p.stock - x.qty
    from jsonb_to_recordset(p_items) as x(product_id text, qty integer)
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

-- ---------------------------------------------------------------------------
-- 4. Dispatch, delivery, and paying the seller
-- ---------------------------------------------------------------------------

create function private.release_order(p_order public.orders)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_rate numeric;
  v_commission integer;
begin
  update public.orders set status = 'delivered', updated_at = now() where id = p_order.id;

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

-- The seller says it is on its way.
create function public.dispatch_order(p_order_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order is null or v_order.seller_id is distinct from auth.uid() then
    raise exception 'order not found';
  end if;
  if v_order.status <> 'placed' then
    raise exception 'order already dispatched';
  end if;

  update public.orders set status = 'dispatched', dispatched_at = now(), updated_at = now() where id = p_order_id;

  perform public.notify(v_order.customer_id, 'order', 'Your order is on the way',
    coalesce(v_order.seller_name || ' dispatched your order', 'Order #' || upper(left(p_order_id::text, 8))),
    'order', p_order_id::text);
end;
$$;

-- The customer says it arrived, which pays the seller.
create function public.confirm_order_received(p_order_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order is null or v_order.customer_id <> auth.uid() then
    raise exception 'order not found';
  end if;
  if v_order.status not in ('placed', 'dispatched') then
    raise exception 'order is closed';
  end if;
  if private.open_dispute_exists('order', p_order_id::text) then
    raise exception 'dispute_open';
  end if;

  perform private.release_order(v_order);
end;
$$;

-- Nobody confirms every delivery, so escrow would sit for ever. A week after
-- dispatch, with no dispute raised, the seller is paid.
create function private.auto_release_orders(p_days integer default 7)
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
    perform private.release_order(v_order);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('auto-release-orders', '30 6 * * *', 'select private.auto_release_orders()');
    raise notice 'pg_cron: order auto-release scheduled daily at 06:30';
  else
    raise notice 'pg_cron not installed; run private.auto_release_orders() on a schedule another way';
  end if;
exception when others then
  raise notice 'auto-release not scheduled (%)', sqlerrm;
end;
$$;

-- Cancelling now returns stock and works for either side before dispatch.
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

  update public.orders
  set status = 'cancelled', updated_at = now(), escrow_held = 0
  where id = p_order_id;

  insert into public.wallet_transactions (profile_id, label, kind, balance_delta, escrow_delta, order_id)
  values (v_order.customer_id, 'Refund · order #' || upper(left(p_order_id::text, 8)), 'refund',
    v_order.total, -v_order.escrow_held, p_order_id);

  update public.products p
  set stock = p.stock + oi.qty
  from public.order_items oi
  where oi.order_id = p_order_id and p.id = oi.product_id and p.stock is not null;

  v_other := case when auth.uid() = v_order.customer_id then v_order.seller_id else v_order.customer_id end;
  if v_other is not null then
    perform public.notify(v_other, 'order', 'Order cancelled',
      '#' || upper(left(p_order_id::text, 8)) || ' · the customer has been refunded', 'order', p_order_id::text);
  end if;
end;
$$;

-- Admins still move first-party orders along; a seller's orders are theirs.
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
  if p_status not in ('dispatched', 'delivered') then
    raise exception 'invalid status';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order is null then
    raise exception 'order not found';
  end if;
  if v_order.status in ('cancelled', 'returned') then
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

-- A refunded order must also release the seller's hold; "release" now pays
-- the seller rather than being refused.
create or replace function private.refund_order(p_order public.orders, p_status text, p_label text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.orders set status = p_status, updated_at = now(), escrow_held = 0 where id = p_order.id;

  insert into public.wallet_transactions (profile_id, label, kind, balance_delta, escrow_delta, order_id)
  values (p_order.customer_id, p_label, 'refund', p_order.total, -p_order.escrow_held, p_order.id);

  if p_order.seller_id is not null then
    perform public.notify(p_order.seller_id, 'dispute', 'Order refunded',
      '#' || upper(left(p_order.id::text, 8)) || ' was refunded to the customer', 'seller_order', p_order.id::text);
  end if;
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
  if p_outcome not in ('release', 'refund', 'dismissed') then
    raise exception 'invalid outcome';
  end if;

  select * into v_dispute from public.disputes where id = p_dispute_id for update;
  if v_dispute is null then
    raise exception 'dispute not found';
  end if;
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

-- An order dispute is now between two people, so the seller is the other party.
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
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'reason required';
  end if;

  if p_ref_type = 'booking' then
    select * into v_booking from public.bookings where id = p_ref_id;
    if v_booking is null or auth.uid() not in (v_booking.customer_id, v_booking.provider_id) then
      raise exception 'booking not found';
    end if;
    if v_booking.status not in ('pending', 'active') then
      raise exception 'booking is closed';
    end if;
    v_against := case when auth.uid() = v_booking.customer_id then v_booking.provider_id else v_booking.customer_id end;
    v_label := v_booking.service;
  elsif p_ref_type = 'order' then
    select * into v_order from public.orders where id = p_ref_id;
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

revoke execute on all functions in schema public from public, anon;
