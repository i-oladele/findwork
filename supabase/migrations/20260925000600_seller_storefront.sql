-- What sellers need to run a storefront from the app.
--
-- 20260921020000 let providers own products and receive orders, but nothing
-- in the app used it: no way to list goods, see an order, or dispatch it.
-- The screens arrive alongside this; this is the database side of them.
--
--   - Product photos: sellers upload to product-images under their own
--     folder, the convention every other bucket uses.
--   - The shop name on a product always comes from the seller's business
--     profile, so nobody can list goods as "FindWork" or as another seller.
--   - Sellers cannot buy their own goods, as providers cannot book themselves.
--   - A customer whose order the seller cancels is told that, in their terms.

-- ---------------------------------------------------------------------------
-- Photos
-- ---------------------------------------------------------------------------

create policy "Owner write: product images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Owner update/delete: product images"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'product-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- What a seller can write
-- ---------------------------------------------------------------------------

alter table public.products
  add constraint products_name_length check (char_length(trim(name)) between 2 and 120),
  add constraint products_description_length check (description is null or char_length(description) <= 2000),
  add constraint products_photo_limit check (array_length(photo_urls, 1) is null or array_length(photo_urls, 1) <= 6);

create function private.stamp_seller_product()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.seller_id is not null then
    select business_name into new.vendor from public.provider_profiles where id = new.seller_id;
    if new.vendor is null then
      raise exception 'provider not found';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger products_stamp_seller
  before insert or update on public.products
  for each row execute procedure private.stamp_seller_product();

-- Renaming the business renames its shop.
create function private.rename_seller_products()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.products set vendor = new.business_name where seller_id = new.id;
  return new;
end;
$$;

create trigger provider_profiles_rename_products
  after update of business_name on public.provider_profiles
  for each row when (old.business_name is distinct from new.business_name)
  execute procedure private.rename_seller_products();

-- ---------------------------------------------------------------------------
-- Checkout refuses your own goods
-- ---------------------------------------------------------------------------

create or replace function public.checkout_quote(p_items jsonb, p_delivery_speed text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_items jsonb := private.normalized_cart(p_items);
  v_delivery_fee integer;
  v_quote jsonb;
  v_missing boolean;
  v_own boolean;
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
    bool_or(p.seller_id = auth.uid()),
    bool_or(p.stock is not null and p.stock < x.qty),
    jsonb_build_object(
      'items_total', sum(p.price::bigint * x.qty),
      'seller_count', count(distinct coalesce(p.seller_id::text, 'findwork')),
      'delivery_fee', count(distinct coalesce(p.seller_id::text, 'findwork')) * v_delivery_fee,
      'total', sum(p.price::bigint * x.qty) + count(distinct coalesce(p.seller_id::text, 'findwork')) * v_delivery_fee)
  into v_missing, v_own, v_stock, v_quote
  from jsonb_to_recordset(v_items) as x(product_id text, qty integer)
  left join public.products p on p.id = x.product_id
  left join public.profiles seller on seller.id = p.seller_id;
  if v_missing then raise exception 'product not found'; end if;
  if v_own then raise exception 'cannot buy your own goods'; end if;
  if v_stock then raise exception 'not enough stock'; end if;
  if (v_quote->>'total')::bigint not between 1 and 2147483647 then raise exception 'invalid order total'; end if;
  return v_quote;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cancelling tells the other side what happened
-- ---------------------------------------------------------------------------

create or replace function public.cancel_order(p_order_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_order public.orders;
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

  -- refund_order tells the seller; only the customer still needs telling.
  perform private.refund_order(v_order, 'cancelled', 'Refund · order #' || upper(left(p_order_id::text, 8)));

  if auth.uid() <> v_order.customer_id then
    perform public.notify(v_order.customer_id, 'order', 'Your order was cancelled',
      coalesce(v_order.seller_name, 'The seller') || ' cannot send it. ₦' ||
        to_char(v_order.total, 'FM999,999,999') || ' is back in your wallet.',
      'order', p_order_id::text);
  end if;
end;
$$;
