-- PRD Corporate Procurement Dashboard, "Linked with Inventory System": the
-- buying side keeps stock records too. Until now only a supplier's shop stock
-- moved when a purchase order was delivered.
--
-- Stock belongs to an organisation, or to someone buying for themselves. It
-- rises when goods from a purchase order are received, falls when they are
-- used, and can be corrected by a count. Every change is kept as a movement,
-- so the figure on hand can always be explained.

-- ---------------------------------------------------------------------------
-- 1. Items and movements
-- ---------------------------------------------------------------------------

create table public.stock_items (
  id uuid primary key default gen_random_uuid(),
  -- Exactly one holder: an organisation, or one person's own purchases.
  organization_id uuid references public.organizations(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 200),
  unit text not null default 'units' check (char_length(unit) between 1 and 20),
  on_hand integer not null default 0 check (on_hand >= 0),
  -- At or below this, the item shows as running low and approvers are told.
  reorder_level integer check (reorder_level is null or reorder_level >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((organization_id is null) <> (owner_id is null))
);
create unique index stock_items_org_name on public.stock_items(organization_id, lower(name), lower(unit)) where organization_id is not null;
create unique index stock_items_owner_name on public.stock_items(owner_id, lower(name), lower(unit)) where owner_id is not null;

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.stock_items(id) on delete cascade,
  delta integer not null check (delta <> 0),
  reason text not null check (reason in ('received', 'used', 'counted')),
  purchase_order_id uuid references public.purchase_orders(id),
  note text check (note is null or char_length(note) <= 300),
  actor_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index stock_movements_item on public.stock_movements(item_id, created_at desc);

-- Receiving a purchase order into stock happens once.
alter table public.purchase_orders add column stock_received_at timestamptz;

-- Whether the caller may read (any member) or manage (owner, approver) a holder's stock.
create function public.stock_access(p_organization_id uuid, p_owner_id uuid, p_manage boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(case
    when p_organization_id is not null then
      coalesce(public.org_role(p_organization_id) in ('owner', 'approver'), false)
      or (not p_manage and public.org_role(p_organization_id) is not null)
    else p_owner_id = auth.uid()
  end, false);
$$;
revoke all on function public.stock_access(uuid, uuid, boolean) from public, anon;
grant execute on function public.stock_access(uuid, uuid, boolean) to authenticated;

alter table public.stock_items enable row level security;
alter table public.stock_movements enable row level security;
revoke all on public.stock_items from anon, authenticated;
revoke all on public.stock_movements from anon, authenticated;
grant select on public.stock_items to authenticated;
grant select on public.stock_movements to authenticated;
create policy "Members read their stock" on public.stock_items for select to authenticated
  using (public.stock_access(organization_id, owner_id, false));
create policy "Members read their stock history" on public.stock_movements for select to authenticated
  using (exists(select 1 from public.stock_items i where i.id = item_id and public.stock_access(i.organization_id, i.owner_id, false)));

-- Applies one change and records it. Tells approvers when an item falls to
-- its reorder level (only on the change that crosses it, not every time).
create function private.move_stock(p_item_id uuid, p_delta integer, p_reason text, p_po_id uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.stock_items; v_after integer;
begin
  select * into v_item from public.stock_items where id = p_item_id for update;
  if v_item.id is null then raise exception 'stock item not found'; end if;
  if p_delta = 0 then return; end if;
  v_after := v_item.on_hand + p_delta;
  if v_after < 0 then raise exception 'not enough on hand'; end if;
  update public.stock_items set on_hand = v_after, updated_at = now() where id = p_item_id;
  insert into public.stock_movements(item_id, delta, reason, purchase_order_id, note, actor_id)
  values (p_item_id, p_delta, p_reason, p_po_id, nullif(trim(p_note), ''), auth.uid());
  if v_item.reorder_level is not null and v_item.on_hand > v_item.reorder_level and v_after <= v_item.reorder_level then
    if v_item.organization_id is not null then
      insert into public.notifications(profile_id, kind, title, body, ref_type, ref_id)
      select m.profile_id, 'order', v_item.name || ' is running low',
        v_after || ' ' || v_item.unit || ' left · reorder level ' || v_item.reorder_level, 'procurement', v_item.organization_id::text
      from public.organization_members m where m.organization_id = v_item.organization_id and m.role in ('owner', 'approver');
    else
      perform public.notify(v_item.owner_id, 'order', v_item.name || ' is running low',
        v_after || ' ' || v_item.unit || ' left · reorder level ' || v_item.reorder_level, 'procurement', null);
    end if;
  end if;
end;
$$;
revoke all on function private.move_stock(uuid, integer, text, uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. What members can do
-- ---------------------------------------------------------------------------

-- Adds an item by hand (stock that was not bought through FindWork), or
-- changes its name, unit or reorder level. p_item_id null creates one.
create function public.save_stock_item(p_item_id uuid, p_organization_id uuid, p_name text, p_unit text, p_reorder_level integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_item public.stock_items; v_id uuid;
begin
  if auth.uid() is null or public.is_suspended(auth.uid()) then raise exception 'not authenticated'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 200 or char_length(trim(coalesce(p_unit, 'units'))) not between 1 and 20
     or (p_reorder_level is not null and p_reorder_level < 0) then
    raise exception 'invalid stock item';
  end if;
  if p_item_id is null then
    if not public.stock_access(p_organization_id, case when p_organization_id is null then auth.uid() end, true) then
      raise exception 'organisation approvers only';
    end if;
    if (select count(*) from public.stock_items
        where case when p_organization_id is null then owner_id = auth.uid() else organization_id = p_organization_id end) >= 500 then
      raise exception 'too many stock items';
    end if;
    insert into public.stock_items(organization_id, owner_id, name, unit, reorder_level)
    values (p_organization_id, case when p_organization_id is null then auth.uid() end, trim(p_name), coalesce(nullif(trim(p_unit), ''), 'units'), p_reorder_level)
    returning id into v_id;
    return v_id;
  end if;
  select * into v_item from public.stock_items where id = p_item_id for update;
  if v_item.id is null or not public.stock_access(v_item.organization_id, v_item.owner_id, true) then raise exception 'stock item not found'; end if;
  update public.stock_items set name = trim(p_name), unit = coalesce(nullif(trim(p_unit), ''), 'units'), reorder_level = p_reorder_level, updated_at = now()
  where id = p_item_id;
  return p_item_id;
end;
$$;

-- Any member may record goods being used; a count that corrects the figure
-- is for owners and approvers. p_quantity is how many were used, or, for a
-- count, how many are actually there.
create function public.record_stock(p_item_id uuid, p_reason text, p_quantity integer, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.stock_items;
begin
  if auth.uid() is null or public.is_suspended(auth.uid()) then raise exception 'not authenticated'; end if;
  select * into v_item from public.stock_items where id = p_item_id;
  if v_item.id is null or not public.stock_access(v_item.organization_id, v_item.owner_id, false) then raise exception 'stock item not found'; end if;
  if p_quantity is null or p_quantity < 0 or p_quantity > 100000000 then raise exception 'invalid stock quantity'; end if;
  if p_reason = 'used' then
    if p_quantity = 0 then raise exception 'invalid stock quantity'; end if;
    perform private.move_stock(p_item_id, -p_quantity, 'used', null, p_note);
  elsif p_reason = 'counted' then
    if not public.stock_access(v_item.organization_id, v_item.owner_id, true) then raise exception 'organisation approvers only'; end if;
    if char_length(trim(coalesce(p_note, ''))) < 3 then raise exception 'count note required'; end if;
    perform private.move_stock(p_item_id, p_quantity - v_item.on_hand, 'counted', null, p_note);
  else
    raise exception 'invalid reason';
  end if;
end;
$$;

-- The buying side records what actually arrived on a purchase order, once,
-- after the supplier marks it delivered. Lines are matched to existing items
-- by name and unit, and new items are created for the rest.
-- p_lines: [{name, unit, quantity}]; a quantity of 0 skips the line.
create function public.receive_purchase_order_stock(p_po_id uuid, p_lines jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  po public.purchase_orders;
  v_line jsonb;
  v_name text;
  v_unit text;
  v_qty numeric;
  v_item uuid;
  v_count integer := 0;
begin
  select * into po from public.purchase_orders where id = p_po_id for update;
  if po.id is null or not private.buys_for(po) then raise exception 'purchase order not found'; end if;
  if po.status not in ('delivered', 'on_hold', 'completed') then raise exception 'purchase order not delivered yet'; end if;
  if po.stock_received_at is not null then raise exception 'already received into stock'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 50 then raise exception 'invalid received lines'; end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_name := trim(coalesce(v_line->>'name', ''));
    v_unit := coalesce(nullif(trim(v_line->>'unit'), ''), 'units');
    if jsonb_typeof(v_line->'quantity') <> 'number' then raise exception 'invalid received lines'; end if;
    v_qty := (v_line->>'quantity')::numeric;
    if v_qty < 0 or v_qty <> trunc(v_qty) or v_qty > 100000000 or char_length(v_name) not between 2 and 200 or char_length(v_unit) > 20 then
      raise exception 'invalid received lines';
    end if;
    continue when v_qty = 0;
    select id into v_item from public.stock_items
    where lower(name) = lower(v_name) and lower(unit) = lower(v_unit)
      and case when po.organization_id is null then owner_id = po.buyer_id else organization_id = po.organization_id end;
    if v_item is null then
      insert into public.stock_items(organization_id, owner_id, name, unit)
      values (po.organization_id, case when po.organization_id is null then po.buyer_id end, v_name, v_unit)
      returning id into v_item;
    end if;
    perform private.move_stock(v_item, v_qty::integer, 'received', p_po_id, 'PO-' || po.number);
    v_count := v_count + 1;
    v_item := null;
  end loop;
  if v_count = 0 then raise exception 'invalid received lines'; end if;
  update public.purchase_orders set stock_received_at = now() where id = p_po_id;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. The dashboard shows what is running low
-- ---------------------------------------------------------------------------

create or replace function public.procurement_summary(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_organization_id is not null and public.org_role(p_organization_id) is null then raise exception 'not a member of that organisation'; end if;
  return (
    with mine as (
      select * from public.purchase_orders po
      where case when p_organization_id is null then po.organization_id is null and po.buyer_id = auth.uid()
                 else po.organization_id = p_organization_id end
    ), stock as (
      select * from public.stock_items s
      where case when p_organization_id is null then s.owner_id = auth.uid() else s.organization_id = p_organization_id end
    )
    select jsonb_build_object(
      'spent', coalesce((select sum(amount) from mine where status = 'completed'), 0),
      'in_escrow', coalesce((select sum(escrow_held) from mine), 0),
      'awaiting_approval', (select count(*) from mine where status = 'pending_approval'),
      'open', (select count(*) from mine where status in ('funded', 'delivered', 'on_hold')),
      'completed', (select count(*) from mine where status = 'completed'),
      'stock_items', (select count(*) from stock),
      'low_stock', (select count(*) from stock where reorder_level is not null and on_hand <= reorder_level),
      'to_receive', (select count(*) from mine where status in ('delivered', 'on_hold', 'completed') and stock_received_at is null),
      'suppliers', coalesce((select jsonb_agg(s order by (s->>'spent')::bigint desc) from (
        select jsonb_build_object('supplier_id', m.supplier_id, 'name', p.full_name, 'tier', p.verification_tier, 'trust', p.trust_score,
          'orders', count(*), 'spent', coalesce(sum(m.amount) filter (where m.status = 'completed'), 0),
          'status', (select os.status from public.organization_suppliers os where os.organization_id = p_organization_id and os.supplier_id = m.supplier_id)) as s
        from mine m join public.profiles p on p.id = m.supplier_id group by m.supplier_id, p.full_name, p.verification_tier, p.trust_score) x), '[]'::jsonb),
      'months', coalesce((select jsonb_agg(jsonb_build_object('month', month, 'spent', spent) order by month) from (
        select to_char(date_trunc('month', closed_at at time zone 'Africa/Lagos'), 'YYYY-MM') as month, sum(amount) as spent
        from mine where status = 'completed' and closed_at > now() - interval '12 months' group by 1) y), '[]'::jsonb)));
end;
$$;

revoke all on function public.save_stock_item(uuid, uuid, text, text, integer) from public, anon;
revoke all on function public.record_stock(uuid, text, integer, text) from public, anon;
revoke all on function public.receive_purchase_order_stock(uuid, jsonb) from public, anon;
grant execute on function public.save_stock_item(uuid, uuid, text, text, integer) to authenticated;
grant execute on function public.record_stock(uuid, text, integer, text) to authenticated;
grant execute on function public.receive_purchase_order_stock(uuid, jsonb) to authenticated;
