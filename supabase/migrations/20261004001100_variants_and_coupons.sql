-- PRD Product Management: variants that are separately priced and stocked.
-- PRD Shopping Cart & Checkout: coupons.
--
-- A coupon is paid for by whoever issues it. A seller's coupon comes out of
-- that seller's proceeds; a FindWork coupon applies to FindWork's own
-- catalog. An order's items_total is what was actually charged for the
-- goods, after the discount, so payout, commission, refunds and reporting
-- all work from the real amount without knowing a coupon was involved.

-- ---------------------------------------------------------------------------
-- 1. Variants
-- ---------------------------------------------------------------------------

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  price integer not null check (price > 0),
  -- Null means not tracked, as on products.
  stock integer check (stock is null or stock >= 0),
  position smallint not null default 1,
  created_at timestamptz not null default now(),
  unique (product_id, name)
);
alter table public.product_variants enable row level security;
revoke all on public.product_variants from anon, authenticated;
grant select on public.product_variants to authenticated;
-- Whoever may see the product may see its options.
create policy "Variants follow their product" on public.product_variants for select to authenticated
  using (exists(select 1 from public.products p where p.id = product_id));

alter table public.order_items
  add column variant_id uuid references public.product_variants(id) on delete set null,
  -- Kept on the order so it still reads correctly if the option is later removed.
  add column variant_name text;

-- A product with options shows its lowest price and the stock across them.
create function private.sync_product_variants()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_product text := coalesce(new.product_id, old.product_id);
begin
  update public.products p
  set price = s.price, stock = s.stock
  from (select min(price) as price, case when bool_or(stock is null) then null else sum(stock)::integer end as stock
        from public.product_variants where product_id = v_product having count(*) > 0) s
  where p.id = v_product and (p.price, p.stock) is distinct from (s.price, s.stock);
  return null;
end;
$$;
create trigger product_variants_sync after insert or update or delete on public.product_variants
  for each row execute function private.sync_product_variants();

-- Replaces a product's set of options with the one given: a list of
-- {id?, name, price, stock?}. Options left out are removed.
create function public.save_product_variants(p_product_id text, p_variants jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_item jsonb; v_position smallint := 0; v_keep uuid[] := '{}'; v_id uuid;
begin
  perform 1 from public.products where id = p_product_id and seller_id = auth.uid() for update;
  if not found then raise exception 'product not found'; end if;
  if p_variants is null or jsonb_typeof(p_variants) <> 'array' or jsonb_array_length(p_variants) > 20 then
    raise exception 'invalid variants';
  end if;
  for v_item in select * from jsonb_array_elements(p_variants) loop
    if nullif(v_item->>'id', '') is not null then v_keep := v_keep || (v_item->>'id')::uuid; end if;
  end loop;
  delete from public.product_variants where product_id = p_product_id and id <> all (v_keep);
  for v_item in select * from jsonb_array_elements(p_variants) loop
    v_position := v_position + 1;
    if jsonb_typeof(v_item->'price') <> 'number' or (v_item->>'price')::numeric <= 0
       or char_length(trim(coalesce(v_item->>'name', ''))) not between 1 and 60
       or (jsonb_typeof(v_item->'stock') = 'number' and (v_item->>'stock')::numeric < 0) then
      raise exception 'invalid variants';
    end if;
    v_id := nullif(v_item->>'id', '')::uuid;
    if v_id is not null then
      update public.product_variants
      set name = trim(v_item->>'name'), price = (v_item->>'price')::integer,
          stock = case when jsonb_typeof(v_item->'stock') = 'number' then (v_item->>'stock')::integer end, position = v_position
      where id = v_id and product_id = p_product_id;
      if not found then raise exception 'invalid variants'; end if;
    else
      insert into public.product_variants(product_id, name, price, stock, position)
      values (p_product_id, trim(v_item->>'name'), (v_item->>'price')::integer,
        case when jsonb_typeof(v_item->'stock') = 'number' then (v_item->>'stock')::integer end, v_position);
    end if;
  end loop;
end;
$$;
revoke all on function public.save_product_variants(text, jsonb) from public, anon;
grant execute on function public.save_product_variants(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Coupons
-- ---------------------------------------------------------------------------

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{4,20}$'),
  -- Null: issued by FindWork, for FindWork's own catalog.
  seller_id uuid references public.provider_profiles(id) on delete cascade,
  kind text not null check (kind in ('percent', 'fixed')),
  value integer not null check (value > 0),
  min_spend integer not null default 0 check (min_spend >= 0),
  max_discount integer check (max_discount is null or max_discount > 0),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  per_customer_limit integer not null default 1 check (per_customer_limit between 1 and 100),
  used_count integer not null default 0 check (used_count >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (kind <> 'percent' or value between 1 and 90)
);
create index coupons_seller on public.coupons(seller_id, created_at desc);
alter table public.coupons enable row level security;
revoke all on public.coupons from anon, authenticated;
grant select on public.coupons to authenticated;
-- Customers never list coupons; a code is checked by the checkout quote.
create policy "Issuers and finance staff read coupons" on public.coupons for select to authenticated
  using (seller_id = auth.uid() or public.staff_can('finance'));

create table public.coupon_redemptions (
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now()
);
create index coupon_redemptions_customer on public.coupon_redemptions(coupon_id, profile_id);
alter table public.coupon_redemptions enable row level security;
revoke all on public.coupon_redemptions from anon, authenticated;
grant select on public.coupon_redemptions to authenticated;
create policy "Customer, issuer and finance staff read redemptions" on public.coupon_redemptions for select to authenticated
  using (profile_id = auth.uid() or public.staff_can('finance')
    or exists(select 1 from public.coupons c where c.id = coupon_id and c.seller_id = auth.uid()));

alter table public.orders
  add column discount integer not null default 0 check (discount >= 0),
  add column coupon_code text;

create function public.save_coupon(
  p_id uuid, p_code text, p_kind text, p_value integer, p_min_spend integer, p_max_discount integer,
  p_ends_at timestamptz, p_usage_limit integer, p_per_customer_limit integer, p_active boolean, p_platform boolean
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  v_seller uuid;
  v_id uuid;
begin
  if coalesce(p_platform, false) then
    if not public.staff_can('finance') then raise exception 'admins only'; end if;
  else
    perform 1 from public.profiles where id = auth.uid() and deleted_at is null and suspended_at is null;
    if not found or not exists(select 1 from public.provider_profiles where id = auth.uid()) then
      raise exception 'provider not found';
    end if;
    v_seller := auth.uid();
  end if;
  if v_code !~ '^[A-Z0-9]{4,20}$' then raise exception 'invalid coupon code'; end if;
  if p_kind is null or p_kind not in ('percent', 'fixed') or p_value is null or p_value <= 0
     or (p_kind = 'percent' and p_value > 90) or coalesce(p_min_spend, 0) < 0
     or (p_max_discount is not null and p_max_discount <= 0)
     or (p_usage_limit is not null and p_usage_limit <= 0)
     or coalesce(p_per_customer_limit, 1) not between 1 and 100
     or (p_ends_at is not null and p_ends_at <= now()) then
    raise exception 'invalid coupon';
  end if;
  if p_id is null then
    insert into public.coupons(code, seller_id, kind, value, min_spend, max_discount, ends_at, usage_limit, per_customer_limit, active)
    values (v_code, v_seller, p_kind, p_value, coalesce(p_min_spend, 0), p_max_discount, p_ends_at, p_usage_limit,
      coalesce(p_per_customer_limit, 1), coalesce(p_active, true))
    returning id into v_id;
  else
    -- The code and the issuer never change: customers may already hold it.
    update public.coupons
    set kind = p_kind, value = p_value, min_spend = coalesce(p_min_spend, 0), max_discount = p_max_discount, ends_at = p_ends_at,
        usage_limit = p_usage_limit, per_customer_limit = coalesce(p_per_customer_limit, 1), active = coalesce(p_active, true)
    where id = p_id and seller_id is not distinct from v_seller
    returning id into v_id;
    if v_id is null then raise exception 'coupon not found'; end if;
  end if;
  return v_id;
end;
$$;
revoke all on function public.save_coupon(uuid, text, text, integer, integer, integer, timestamptz, integer, integer, boolean, boolean) from public, anon;
grant execute on function public.save_coupon(uuid, text, text, integer, integer, integer, timestamptz, integer, integer, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. One pricing function for the quote and the charge
-- ---------------------------------------------------------------------------

create or replace function private.normalized_cart(p_items jsonb)
returns jsonb language plpgsql immutable set search_path = public as $$
declare v_items jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'cart is empty'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'cart is empty'; end if;
  if jsonb_array_length(p_items) > 100 then raise exception 'cart too large'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as x(product_id text, variant_id uuid, qty integer)
    where x.product_id is null or x.qty is null or x.qty not between 1 and 99
  ) then raise exception 'invalid quantity'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as x(product_id text, variant_id uuid, qty integer)
    group by x.product_id, x.variant_id having sum(x.qty) > 99
  ) then raise exception 'invalid quantity'; end if;
  select jsonb_agg(jsonb_build_object('product_id', product_id, 'variant_id', variant_id, 'qty', qty) order by product_id, variant_id)
  into v_items from (
    select x.product_id, x.variant_id, sum(x.qty)::integer as qty
    from jsonb_to_recordset(p_items) as x(product_id text, variant_id uuid, qty integer) group by x.product_id, x.variant_id
  ) items;
  return v_items;
end;
$$;

-- Prices a normalised cart: one group per seller, each with its goods,
-- discount and delivery. checkout_quote shows this to the customer and
-- place_order charges exactly it.
create function private.price_cart(p_items jsonb, p_delivery_speed text, p_coupon_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_delivery_fee integer;
  v_missing boolean; v_option boolean; v_own boolean; v_stock boolean;
  v_groups jsonb;
  v_code text := upper(regexp_replace(coalesce(p_coupon_code, ''), '\s', '', 'g'));
  v_coupon public.coupons;
  v_coupon_key text;
  v_coupon_error text;
  v_base bigint;
  v_discount bigint := 0;
  v_items_total bigint;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_delivery_speed is null or p_delivery_speed not in ('same-day', 'standard') then
    raise exception 'invalid delivery speed';
  end if;
  v_delivery_fee := case p_delivery_speed when 'same-day' then 1800 else 1200 end;

  select
    bool_or(p.id is null or p.status <> 'live' or coalesce(v.price, p.price) <= 0
      or (x.variant_id is not null and v.id is null)
      or (p.seller_id is not null and (seller.id is null or seller.deleted_at is not null or seller.suspended_at is not null))),
    bool_or(x.variant_id is null and exists(select 1 from public.product_variants pv where pv.product_id = x.product_id)),
    bool_or(p.seller_id = auth.uid()),
    bool_or(case when v.id is not null then v.stock is not null and v.stock < x.qty
                 else p.stock is not null and p.stock < x.qty end)
  into v_missing, v_option, v_own, v_stock
  from jsonb_to_recordset(p_items) as x(product_id text, variant_id uuid, qty integer)
  left join public.products p on p.id = x.product_id
  left join public.product_variants v on v.id = x.variant_id and v.product_id = x.product_id
  left join public.profiles seller on seller.id = p.seller_id;
  if v_missing then raise exception 'product not found'; end if;
  if v_option then raise exception 'choose an option'; end if;
  if v_own then raise exception 'cannot buy your own goods'; end if;
  if v_stock then raise exception 'not enough stock'; end if;

  select jsonb_agg(g order by g->>'key'), sum((g->>'items_total')::bigint), count(*)
  into v_groups, v_items_total, v_count
  from (
    select jsonb_build_object(
      'key', coalesce(p.seller_id::text, 'findwork'), 'seller_id', p.seller_id, 'seller_name', max(pp.business_name),
      'items_total', sum(coalesce(v.price, p.price)::bigint * x.qty), 'discount', 0) as g
    from jsonb_to_recordset(p_items) as x(product_id text, variant_id uuid, qty integer)
    join public.products p on p.id = x.product_id
    left join public.product_variants v on v.id = x.variant_id
    left join public.provider_profiles pp on pp.id = p.seller_id
    group by p.seller_id
  ) grouped;

  if v_code <> '' then
    select * into v_coupon from public.coupons where code = v_code;
    v_coupon_key := coalesce(v_coupon.seller_id::text, 'findwork');
    if v_coupon.id is null or not v_coupon.active or v_coupon.starts_at > now()
       or (v_coupon.ends_at is not null and v_coupon.ends_at <= now()) then
      v_coupon_error := 'coupon_invalid';
    elsif v_coupon.usage_limit is not null and v_coupon.used_count >= v_coupon.usage_limit then
      v_coupon_error := 'coupon_used_up';
    elsif (select count(*) from public.coupon_redemptions where coupon_id = v_coupon.id and profile_id = auth.uid())
        >= v_coupon.per_customer_limit then
      v_coupon_error := 'coupon_already_used';
    else
      select (g->>'items_total')::bigint into v_base from jsonb_array_elements(v_groups) g where g->>'key' = v_coupon_key;
      if v_base is null then
        v_coupon_error := 'coupon_not_for_cart';
      elsif v_base < v_coupon.min_spend then
        v_coupon_error := 'coupon_min_spend';
      else
        v_discount := case v_coupon.kind when 'percent' then floor(v_base * v_coupon.value / 100.0)::bigint else v_coupon.value end;
        v_discount := least(v_discount, coalesce(v_coupon.max_discount, v_discount), v_base);
        select jsonb_agg(case when g->>'key' = v_coupon_key then g || jsonb_build_object('discount', v_discount) else g end order by g->>'key')
        into v_groups from jsonb_array_elements(v_groups) g;
      end if;
    end if;
  end if;

  if v_items_total - v_discount + v_count * v_delivery_fee not between 1 and 2147483647 then raise exception 'invalid order total'; end if;
  return jsonb_build_object(
    'groups', v_groups,
    'items_total', v_items_total,
    'discount', v_discount,
    'seller_count', v_count,
    'delivery_fee', v_count * v_delivery_fee,
    'total', v_items_total - v_discount + v_count * v_delivery_fee,
    'coupon', case when v_code = '' then null else jsonb_build_object(
      'code', v_code, 'id', v_coupon.id, 'error', v_coupon_error, 'discount', v_discount,
      'issuer', case when v_coupon.id is null then null when v_coupon.seller_id is null then 'FindWork'
        else (select business_name from public.provider_profiles where id = v_coupon.seller_id) end) end);
end;
$$;
revoke all on function private.price_cart(jsonb, text, text) from public, anon, authenticated;

drop function public.checkout_quote(jsonb, text);
create function public.checkout_quote(p_items jsonb, p_delivery_speed text, p_coupon_code text default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  return private.price_cart(private.normalized_cart(p_items), p_delivery_speed, p_coupon_code) - 'groups';
end;
$$;
revoke all on function public.checkout_quote(jsonb, text, text) from public, anon;
grant execute on function public.checkout_quote(jsonb, text, text) to authenticated;

drop function public.place_order(jsonb, text, text, text, integer);
create function public.place_order(p_items jsonb, p_delivery_speed text, p_address text, p_phone text, p_expected_total integer default null, p_coupon_code text default null)
returns uuid[] language plpgsql security definer set search_path = public as $$
declare
  v_items jsonb;
  v_quote jsonb;
  v_group jsonb;
  v_code text := upper(regexp_replace(coalesce(p_coupon_code, ''), '\s', '', 'g'));
  v_delivery_fee integer;
  v_total_due integer;
  v_seller_id uuid;
  v_seller_name text;
  v_discount integer;
  v_items_total integer;
  v_order_total integer;
  v_order_id uuid;
  v_order_ids uuid[] := '{}';
begin
  if p_delivery_speed not in ('same-day', 'standard') then raise exception 'invalid delivery speed'; end if;
  if coalesce(trim(p_address), '') = '' then raise exception 'address required'; end if;
  v_items := private.normalized_cart(p_items);
  -- Locks are taken in one order everywhere: products, their options, the
  -- coupon, then the wallet. Nothing the price depends on can change until
  -- this order commits.
  perform p.id from public.products p
  join jsonb_to_recordset(v_items) as x(product_id text, variant_id uuid, qty integer) on x.product_id = p.id
  order by p.id for update of p;
  perform v.id from public.product_variants v
  join jsonb_to_recordset(v_items) as x(product_id text, variant_id uuid, qty integer) on x.variant_id = v.id
  order by v.id for update of v;
  if v_code <> '' then
    perform 1 from public.coupons where code = v_code for update;
  end if;

  v_quote := private.price_cart(v_items, p_delivery_speed, v_code);
  -- A code that does not apply is an error, not a silent full-price order.
  if v_quote->'coupon'->>'error' is not null then raise exception '%', v_quote->'coupon'->>'error'; end if;
  v_total_due := (v_quote->>'total')::integer;
  if p_expected_total is null or p_expected_total <> v_total_due then raise exception 'checkout_total_changed'; end if;
  v_delivery_fee := case p_delivery_speed when 'same-day' then 1800 else 1200 end;

  if private.locked_balance(auth.uid()) < v_total_due then raise exception 'insufficient_balance'; end if;

  for v_group in select * from jsonb_array_elements(v_quote->'groups') loop
    v_seller_id := nullif(v_group->>'seller_id', '')::uuid;
    v_seller_name := v_group->>'seller_name';
    v_discount := (v_group->>'discount')::integer;
    -- What is charged for the goods: this is what the seller is paid from.
    v_items_total := (v_group->>'items_total')::integer - v_discount;
    v_order_total := v_items_total + v_delivery_fee;

    insert into public.orders (
      customer_id, seller_id, seller_name, total, items_total, discount, coupon_code, delivery_speed, delivery_fee,
      delivery_address, contact_phone, escrow_held
    )
    values (
      auth.uid(), v_seller_id, v_seller_name, v_order_total, v_items_total, v_discount,
      case when v_discount > 0 then v_code end, p_delivery_speed, v_delivery_fee, trim(p_address), nullif(trim(p_phone), ''),
      -- Only a real seller's money is held; the first-party catalog has
      -- nobody waiting to be paid.
      case when v_seller_id is null then 0 else v_order_total end
    )
    returning id into v_order_id;

    insert into public.order_items (order_id, product_id, name, price, qty, variant_id, variant_name)
    select v_order_id, p.id, p.name, coalesce(v.price, p.price), x.qty, v.id, v.name
    from jsonb_to_recordset(v_items) as x(product_id text, variant_id uuid, qty integer)
    join public.products p on p.id = x.product_id
    left join public.product_variants v on v.id = x.variant_id
    where p.seller_id is not distinct from v_seller_id;

    update public.product_variants v
    set stock = v.stock - x.qty
    from jsonb_to_recordset(v_items) as x(product_id text, variant_id uuid, qty integer)
    join public.products p on p.id = x.product_id
    where v.id = x.variant_id and v.stock is not null and p.seller_id is not distinct from v_seller_id;

    update public.products p
    set stock = p.stock - x.qty
    from jsonb_to_recordset(v_items) as x(product_id text, variant_id uuid, qty integer)
    where p.id = x.product_id and x.variant_id is null and p.stock is not null and p.seller_id is not distinct from v_seller_id;

    insert into public.wallet_transactions (profile_id, label, kind, balance_delta, escrow_delta, order_id)
    values (
      auth.uid(),
      'Order #' || upper(left(v_order_id::text, 8)) || coalesce(' · ' || v_seller_name, ''),
      'order', -v_order_total,
      case when v_seller_id is null then 0 else v_order_total end,
      v_order_id
    );

    if v_discount > 0 then
      insert into public.coupon_redemptions(coupon_id, profile_id, order_id, amount)
      values ((v_quote->'coupon'->>'id')::uuid, auth.uid(), v_order_id, v_discount);
      update public.coupons set used_count = used_count + 1 where id = (v_quote->'coupon'->>'id')::uuid;
    end if;

    if v_seller_id is null then
      perform private.notify_admins('order', 'New order to fulfil',
        '#' || upper(left(v_order_id::text, 8)) || ' · ₦' || to_char(v_order_total, 'FM999,999,999'),
        'admin_order', v_order_id::text);
    else
      perform public.notify(v_seller_id, 'order', 'New order',
        '₦' || to_char(v_items_total, 'FM999,999,999') || ' · the money is in escrow',
        'seller_order', v_order_id::text);
    end if;

    v_order_ids := v_order_ids || v_order_id;
  end loop;

  return v_order_ids;
end;
$$;
revoke all on function public.place_order(jsonb, text, text, text, integer, text) from public, anon;
grant execute on function public.place_order(jsonb, text, text, text, integer, text) to authenticated;

-- Cancelling before dispatch puts each option's stock back and frees the
-- coupon to be used again. Everything else is as before.
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
    update public.product_variants v set stock = v.stock + quantities.qty
    from (select variant_id, sum(qty)::integer qty from public.order_items
          where order_id = v_order.id and variant_id is not null group by variant_id) quantities
    where v.id = quantities.variant_id and v.stock is not null;
    update public.products p set stock = p.stock + quantities.qty
    from (select product_id, sum(qty)::integer qty from public.order_items
          where order_id = v_order.id and variant_id is null group by product_id) quantities
    where p.id = quantities.product_id and p.stock is not null;
    update public.coupons c set used_count = greatest(0, c.used_count - 1)
    from public.coupon_redemptions r where r.order_id = v_order.id and c.id = r.coupon_id;
    delete from public.coupon_redemptions where order_id = v_order.id;
  end if;
  if v_order.seller_id is not null then
    perform public.notify(v_order.seller_id, 'dispute', 'Order refunded',
      '#' || upper(left(v_order.id::text, 8)) || ' was refunded to the customer', 'seller_order', v_order.id::text);
  end if;
end;
$$;
