-- PRD RFQ System and Corporate Procurement Dashboard: organisations with
-- approvers, quotes that become purchase orders held in escrow, invoices,
-- approved-supplier lists, bulk requests and a spend summary.
--
-- An organisation's purchases are paid from its owner's wallet: that wallet
-- is the company's account here. Someone buying for themselves pays from
-- their own.

alter table public.wallet_transactions add column purchase_order_id uuid;

-- ---------------------------------------------------------------------------
-- 1. Organisations
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 160),
  owner_id uuid not null references public.profiles(id),
  -- A purchase above this needs an owner or approver; at or below it a buyer
  -- may commit the organisation alone.
  approval_threshold integer not null default 0 check (approval_threshold >= 0),
  created_at timestamptz not null default now()
);
create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'approver', 'buyer')),
  created_at timestamptz not null default now(),
  primary key (organization_id, profile_id)
);
create index organization_members_profile on public.organization_members(profile_id);

create function public.org_role(p_organization_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from public.organization_members where organization_id = p_organization_id and profile_id = auth.uid();
$$;
revoke all on function public.org_role(uuid) from public, anon;
grant execute on function public.org_role(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
revoke all on public.organizations from anon, authenticated;
revoke all on public.organization_members from anon, authenticated;
grant select on public.organizations to authenticated;
grant select on public.organization_members to authenticated;
create policy "Members read their organisation" on public.organizations for select to authenticated
  using (public.org_role(id) is not null);
create policy "Members read the member list" on public.organization_members for select to authenticated
  using (public.org_role(organization_id) is not null);

create function public.create_organization(p_name text, p_approval_threshold integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform 1 from public.profiles where id = auth.uid() and deleted_at is null and suspended_at is null for update;
  if not found then raise exception 'not authenticated'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 160 or coalesce(p_approval_threshold, 0) < 0 then
    raise exception 'invalid organisation';
  end if;
  if (select count(*) from public.organizations where owner_id = auth.uid()) >= 5 then raise exception 'too many organisations'; end if;
  insert into public.organizations(name, owner_id, approval_threshold)
  values (trim(p_name), auth.uid(), coalesce(p_approval_threshold, 0)) returning id into v_id;
  insert into public.organization_members(organization_id, profile_id, role) values (v_id, auth.uid(), 'owner');
  return v_id;
end;
$$;

create function public.update_organization(p_organization_id uuid, p_name text, p_approval_threshold integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.org_role(p_organization_id) is distinct from 'owner' then raise exception 'organisation owners only'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 2 and 160 or coalesce(p_approval_threshold, 0) < 0 then
    raise exception 'invalid organisation';
  end if;
  update public.organizations set name = trim(p_name), approval_threshold = p_approval_threshold where id = p_organization_id;
end;
$$;

-- p_role null removes the member. The owner cannot be changed or removed.
create function public.set_organization_member(p_organization_id uuid, p_profile_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.org_role(p_organization_id) is distinct from 'owner' then raise exception 'organisation owners only'; end if;
  if p_profile_id = auth.uid() then raise exception 'cannot change your own account'; end if;
  if p_role is not null and p_role not in ('approver', 'buyer') then raise exception 'invalid role'; end if;
  if p_role is null then
    delete from public.organization_members where organization_id = p_organization_id and profile_id = p_profile_id and role <> 'owner';
    return;
  end if;
  perform 1 from public.profiles where id = p_profile_id and deleted_at is null and suspended_at is null;
  if not found then raise exception 'profile not found'; end if;
  if (select count(*) from public.organization_members where organization_id = p_organization_id) >= 50 then
    raise exception 'too many members';
  end if;
  insert into public.organization_members(organization_id, profile_id, role) values (p_organization_id, p_profile_id, p_role)
  on conflict (organization_id, profile_id) do update set role = excluded.role where public.organization_members.role <> 'owner';
  perform public.notify(p_profile_id, 'system', 'You were added to an organisation',
    (select name from public.organizations where id = p_organization_id) || ' · as ' || p_role, 'procurement', p_organization_id::text);
end;
$$;

-- The suppliers an organisation has approved, or will not buy from.
create table public.organization_suppliers (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid not null references public.profiles(id),
  status text not null check (status in ('approved', 'blocked')),
  note text check (note is null or char_length(note) <= 300),
  added_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  primary key (organization_id, supplier_id)
);
alter table public.organization_suppliers enable row level security;
revoke all on public.organization_suppliers from anon, authenticated;
grant select on public.organization_suppliers to authenticated;
create policy "Members read their supplier list" on public.organization_suppliers for select to authenticated
  using (public.org_role(organization_id) is not null);

create function public.set_organization_supplier(p_organization_id uuid, p_supplier_id uuid, p_status text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.org_role(p_organization_id) is null or public.org_role(p_organization_id) not in ('owner', 'approver') then
    raise exception 'organisation approvers only';
  end if;
  if p_status is null then
    delete from public.organization_suppliers where organization_id = p_organization_id and supplier_id = p_supplier_id;
    return;
  end if;
  if p_status not in ('approved', 'blocked') then raise exception 'invalid status'; end if;
  insert into public.organization_suppliers(organization_id, supplier_id, status, note, added_by)
  values (p_organization_id, p_supplier_id, p_status, nullif(trim(p_note), ''), auth.uid())
  on conflict (organization_id, supplier_id) do update set status = excluded.status, note = excluded.note, added_by = excluded.added_by;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Requests with line items, and who may quote
-- ---------------------------------------------------------------------------

alter table public.rfqs
  add column organization_id uuid references public.organizations(id),
  -- 0 anyone, 2 ID verified, 3 a verified business.
  add column min_supplier_tier smallint not null default 0 check (min_supplier_tier in (0, 2, 3));

create table public.rfq_items (
  rfq_id uuid not null references public.rfqs(id) on delete cascade,
  position smallint not null check (position > 0),
  description text not null check (char_length(trim(description)) between 2 and 200),
  quantity integer not null check (quantity > 0),
  unit text not null default 'units' check (char_length(unit) between 1 and 20),
  primary key (rfq_id, position)
);
alter table public.rfq_items enable row level security;
revoke all on public.rfq_items from anon, authenticated;
grant select on public.rfq_items to authenticated;
create policy "Request lines are browsable like requests" on public.rfq_items for select to authenticated using (true);

-- A request with several lines is one bulk order. p_items: [{description, quantity, unit}].
create function public.post_rfq(
  p_organization_id uuid, p_title text, p_description text, p_deadline text, p_budget_max integer,
  p_min_supplier_tier integer, p_items jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_item jsonb; v_position smallint := 0;
begin
  perform 1 from public.profiles where id = auth.uid() and deleted_at is null and suspended_at is null;
  if not found then raise exception 'not authenticated'; end if;
  if p_organization_id is not null and public.org_role(p_organization_id) is null then raise exception 'not a member of that organisation'; end if;
  if char_length(trim(coalesce(p_title, ''))) not between 3 and 160 then raise exception 'invalid request'; end if;
  if coalesce(p_min_supplier_tier, 0) not in (0, 2, 3) or (p_budget_max is not null and p_budget_max <= 0) then raise exception 'invalid request'; end if;
  if p_items is not null and (jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 50) then raise exception 'invalid request'; end if;
  insert into public.rfqs(buyer_id, organization_id, title, description, deadline, budget_max, min_supplier_tier, quantity)
  values (auth.uid(), p_organization_id, trim(p_title), coalesce(trim(p_description), ''), nullif(trim(p_deadline), ''), p_budget_max,
    coalesce(p_min_supplier_tier, 0),
    case when coalesce(jsonb_array_length(p_items), 0) > 0 then jsonb_array_length(p_items) || ' line' || case when jsonb_array_length(p_items) = 1 then '' else 's' end end)
  returning id into v_id;
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_position := v_position + 1;
    if jsonb_typeof(v_item->'quantity') <> 'number' or (v_item->>'quantity')::numeric <= 0
       or char_length(trim(coalesce(v_item->>'description', ''))) not between 2 and 200 then
      raise exception 'invalid request';
    end if;
    insert into public.rfq_items(rfq_id, position, description, quantity, unit)
    values (v_id, v_position, trim(v_item->>'description'), (v_item->>'quantity')::integer, coalesce(nullif(trim(v_item->>'unit'), ''), 'units'));
  end loop;
  return v_id;
end;
$$;

-- A request can ask for verified suppliers only, and an organisation's
-- blocked suppliers cannot quote on its requests.
create function private.guard_rfq_quote()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_rfq public.rfqs;
begin
  select * into v_rfq from public.rfqs where id = new.rfq_id;
  if private.verification_tier(new.supplier_id) < v_rfq.min_supplier_tier then raise exception 'supplier_not_verified'; end if;
  if v_rfq.organization_id is not null and exists(select 1 from public.organization_suppliers
      where organization_id = v_rfq.organization_id and supplier_id = new.supplier_id and status = 'blocked') then
    raise exception 'supplier_blocked';
  end if;
  return new;
end;
$$;
create trigger rfq_quotes_guard before insert on public.rfq_quotes for each row execute function private.guard_rfq_quote();

-- Approvers compare quotes on their organisation's requests, not only the
-- member who posted the request.
create policy "Organisation members see quotes on its requests" on public.rfq_quotes for select to authenticated
  using (exists(select 1 from public.rfqs r where r.id = rfq_quotes.rfq_id
    and r.organization_id is not null and public.org_role(r.organization_id) is not null));

-- ---------------------------------------------------------------------------
-- 3. Purchase orders, held in escrow
-- ---------------------------------------------------------------------------

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity (start with 1001),
  rfq_id uuid not null references public.rfqs(id),
  quote_id uuid not null unique references public.rfq_quotes(id),
  organization_id uuid references public.organizations(id),
  buyer_id uuid not null references public.profiles(id),
  -- Whose wallet pays: the organisation's owner, or the buyer themselves.
  payer_id uuid not null references public.profiles(id),
  supplier_id uuid not null references public.profiles(id),
  title text not null,
  amount integer not null check (amount > 0),
  commission integer not null default 0,
  escrow_held integer not null default 0 check (escrow_held >= 0),
  status text not null default 'pending_approval'
    check (status in ('pending_approval', 'rejected', 'funded', 'delivered', 'on_hold', 'completed', 'cancelled', 'refunded')),
  decided_by uuid references public.profiles(id),
  decision_note text,
  hold_reason text,
  funded_at timestamptz,
  delivered_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.wallet_transactions
  add constraint wallet_transactions_purchase_order_id_fkey foreign key (purchase_order_id) references public.purchase_orders(id);
create index purchase_orders_buyer on public.purchase_orders(buyer_id, created_at desc);
create index purchase_orders_supplier on public.purchase_orders(supplier_id, created_at desc);
create index purchase_orders_org on public.purchase_orders(organization_id, created_at desc);
alter table public.purchase_orders enable row level security;
revoke all on public.purchase_orders from anon, authenticated;
grant select on public.purchase_orders to authenticated;
create policy "Buyer, payer, supplier, organisation and staff read a purchase order" on public.purchase_orders for select to authenticated
  using (auth.uid() in (buyer_id, payer_id, supplier_id) or public.org_role(organization_id) is not null
    or public.staff_can('disputes') or public.staff_can('finance'));

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity (start with 5001),
  purchase_order_id uuid not null unique references public.purchase_orders(id) on delete cascade,
  supplier_id uuid not null references public.profiles(id),
  payer_id uuid not null references public.profiles(id),
  organization_id uuid references public.organizations(id),
  amount integer not null check (amount > 0),
  status text not null default 'issued' check (status in ('issued', 'paid', 'void')),
  issued_at timestamptz not null default now(),
  paid_at timestamptz
);
alter table public.invoices enable row level security;
revoke all on public.invoices from anon, authenticated;
grant select on public.invoices to authenticated;
create policy "Both sides, the organisation and finance staff read an invoice" on public.invoices for select to authenticated
  using (auth.uid() in (supplier_id, payer_id) or public.org_role(organization_id) is not null or public.staff_can('finance')
    or exists(select 1 from public.purchase_orders po where po.id = purchase_order_id and po.buyer_id = auth.uid()));

-- Takes the money into escrow and issues the supplier's invoice.
create function private.fund_purchase_order(p_po_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare po public.purchase_orders;
begin
  select * into po from public.purchase_orders where id = p_po_id for update;
  if po.status <> 'pending_approval' then raise exception 'purchase order cannot be changed'; end if;
  if private.locked_balance(po.payer_id) < po.amount then raise exception 'insufficient_balance'; end if;
  update public.purchase_orders set status = 'funded', escrow_held = amount, funded_at = now() where id = p_po_id;
  insert into public.wallet_transactions(profile_id, label, kind, balance_delta, escrow_delta, purchase_order_id)
  values (po.payer_id, 'Escrow · PO-' || po.number || ' · ' || left(po.title, 60), 'escrow', -po.amount, po.amount, p_po_id);
  insert into public.invoices(purchase_order_id, supplier_id, payer_id, organization_id, amount)
  values (p_po_id, po.supplier_id, po.payer_id, po.organization_id, po.amount);
  perform public.notify(po.supplier_id, 'order', 'Purchase order PO-' || po.number || ' is funded',
    '₦' || to_char(po.amount, 'FM999,999,999') || ' is held in escrow for ' || po.title, 'purchase_order', p_po_id::text);
end;
$$;

create function private.release_purchase_order(p_po_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare po public.purchase_orders; v_rate numeric; v_commission integer;
begin
  select * into po from public.purchase_orders where id = p_po_id for update;
  if po.status not in ('funded', 'delivered', 'on_hold') then raise exception 'purchase order cannot be changed'; end if;
  v_rate := private.commission_rate(po.supplier_id);
  v_commission := round(po.amount * v_rate);
  update public.purchase_orders set status = 'completed', commission = v_commission, escrow_held = 0, closed_at = now() where id = p_po_id;
  insert into public.wallet_transactions(profile_id, label, kind, escrow_delta, purchase_order_id)
  values (po.payer_id, 'Released · PO-' || po.number, 'release', -po.escrow_held, p_po_id);
  insert into public.wallet_transactions(profile_id, label, kind, balance_delta, purchase_order_id)
  values (po.supplier_id, 'Payment · PO-' || po.number, 'release', po.amount, p_po_id);
  if v_commission > 0 then
    insert into public.wallet_transactions(profile_id, label, kind, balance_delta, purchase_order_id)
    values (po.supplier_id, 'FindWork fee · ' || round(v_rate * 100) || '%', 'fee', -v_commission, p_po_id);
  end if;
  update public.invoices set status = 'paid', paid_at = now() where purchase_order_id = p_po_id;
  perform public.notify(po.supplier_id, 'payment', 'You have been paid',
    'PO-' || po.number || ' · ₦' || to_char(po.amount - v_commission, 'FM999,999,999'), 'wallet', null);
end;
$$;

create function private.refund_purchase_order(p_po_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare po public.purchase_orders;
begin
  select * into po from public.purchase_orders where id = p_po_id for update;
  if po.status not in ('funded', 'delivered', 'on_hold') then raise exception 'purchase order cannot be changed'; end if;
  update public.purchase_orders set status = p_status, escrow_held = 0, closed_at = now() where id = p_po_id;
  insert into public.wallet_transactions(profile_id, label, kind, balance_delta, escrow_delta, purchase_order_id)
  values (po.payer_id, 'Refund · PO-' || po.number, 'refund', po.escrow_held, -po.escrow_held, p_po_id);
  update public.invoices set status = 'void' where purchase_order_id = p_po_id;
  update public.rfq_quotes set accepted = false where id = po.quote_id;
end;
$$;
revoke all on function private.fund_purchase_order(uuid) from public, anon, authenticated;
revoke all on function private.release_purchase_order(uuid) from public, anon, authenticated;
revoke all on function private.refund_purchase_order(uuid, text) from public, anon, authenticated;

-- Accepting a quote raises a purchase order. It is funded at once unless it
-- is an organisation's purchase above its threshold raised by a buyer, in
-- which case it waits for an owner or approver.
drop function public.accept_rfq_quote(uuid);
create function public.accept_rfq_quote(p_quote_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_quote public.rfq_quotes;
  v_rfq public.rfqs;
  v_org public.organizations;
  v_role text;
  v_payer uuid;
  v_po uuid;
begin
  select * into v_quote from public.rfq_quotes where id = p_quote_id;
  if v_quote.id is null then raise exception 'quote not found'; end if;
  select * into v_rfq from public.rfqs where id = v_quote.rfq_id for update;
  if v_rfq.organization_id is null then
    if v_rfq.buyer_id <> auth.uid() then raise exception 'not your RFQ'; end if;
    v_payer := auth.uid();
  else
    select * into v_org from public.organizations where id = v_rfq.organization_id;
    v_role := public.org_role(v_org.id);
    if v_role is null then raise exception 'not your RFQ'; end if;
    v_payer := v_org.owner_id;
    if exists(select 1 from public.organization_suppliers
        where organization_id = v_org.id and supplier_id = v_quote.supplier_id and status = 'blocked') then
      raise exception 'supplier_blocked';
    end if;
  end if;
  if v_rfq.status = 'closed' then raise exception 'RFQ is closed'; end if;
  if public.is_suspended(v_quote.supplier_id) then raise exception 'counterparty_suspended'; end if;

  insert into public.purchase_orders(rfq_id, quote_id, organization_id, buyer_id, payer_id, supplier_id, title, amount)
  values (v_rfq.id, v_quote.id, v_rfq.organization_id, auth.uid(), v_payer, v_quote.supplier_id, v_rfq.title, v_quote.price)
  returning id into v_po;
  update public.rfq_quotes set accepted = (id = p_quote_id) where rfq_id = v_rfq.id;
  update public.rfqs set status = 'closed' where id = v_rfq.id;

  if v_org.id is null or v_role in ('owner', 'approver') or v_quote.price <= v_org.approval_threshold then
    update public.purchase_orders set decided_by = auth.uid() where id = v_po;
    perform private.fund_purchase_order(v_po);
  else
    insert into public.notifications(profile_id, kind, title, body, ref_type, ref_id)
    select m.profile_id, 'order', 'A purchase needs your approval',
      v_rfq.title || ' · ₦' || to_char(v_quote.price, 'FM999,999,999'), 'purchase_order', v_po::text
    from public.organization_members m where m.organization_id = v_org.id and m.role in ('owner', 'approver');
  end if;
  return v_po;
end;
$$;

create function public.review_purchase_order(p_po_id uuid, p_approve boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare po public.purchase_orders;
begin
  select * into po from public.purchase_orders where id = p_po_id for update;
  if po.id is null or po.organization_id is null or public.org_role(po.organization_id) is null
     or public.org_role(po.organization_id) not in ('owner', 'approver') then
    raise exception 'organisation approvers only';
  end if;
  if po.status <> 'pending_approval' then raise exception 'purchase order cannot be changed'; end if;
  update public.purchase_orders set decided_by = auth.uid(), decision_note = nullif(trim(p_note), '') where id = p_po_id;
  if coalesce(p_approve, false) then
    perform private.fund_purchase_order(p_po_id);
    perform public.notify(po.buyer_id, 'order', 'Your purchase was approved', 'PO-' || po.number || ' · ' || po.title, 'purchase_order', p_po_id::text);
  else
    if char_length(trim(coalesce(p_note, ''))) < 3 then raise exception 'rejection reason required'; end if;
    update public.purchase_orders set status = 'rejected', closed_at = now() where id = p_po_id;
    -- The request reopens so another quote can be chosen.
    update public.rfq_quotes set accepted = false where id = po.quote_id;
    update public.rfqs set status = 'quoted' where id = po.rfq_id;
    perform public.notify(po.buyer_id, 'order', 'Your purchase was not approved', coalesce(nullif(trim(p_note), ''), po.title), 'purchase_order', p_po_id::text);
  end if;
end;
$$;

-- Whether the caller acts for the buying side of a purchase order.
create function private.buys_for(po public.purchase_orders)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() in (po.buyer_id, po.payer_id) or coalesce(public.org_role(po.organization_id) in ('owner', 'approver'), false);
$$;
revoke all on function private.buys_for(public.purchase_orders) from public, anon, authenticated;

-- The supplier says the goods have gone. p_stock, optional, takes the
-- quantities out of the supplier's own product stock: [{product_id, qty}].
create function public.mark_purchase_order_delivered(p_po_id uuid, p_stock jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare po public.purchase_orders; v_line jsonb; v_updated integer;
begin
  select * into po from public.purchase_orders where id = p_po_id for update;
  if po.id is null or po.supplier_id <> auth.uid() then raise exception 'purchase order not found'; end if;
  if po.status <> 'funded' then raise exception 'purchase order cannot be changed'; end if;
  if p_stock is not null then
    if jsonb_typeof(p_stock) <> 'array' or jsonb_array_length(p_stock) > 50 then raise exception 'invalid stock lines'; end if;
    for v_line in select * from jsonb_array_elements(p_stock) loop
      if jsonb_typeof(v_line->'qty') <> 'number' or (v_line->>'qty')::numeric <= 0 then raise exception 'invalid stock lines'; end if;
      update public.products set stock = stock - (v_line->>'qty')::integer
      where id = v_line->>'product_id' and seller_id = auth.uid() and stock is not null and stock >= (v_line->>'qty')::integer;
      get diagnostics v_updated = row_count;
      if v_updated = 0 then raise exception 'not enough stock'; end if;
    end loop;
  end if;
  update public.purchase_orders set status = 'delivered', delivered_at = now() where id = p_po_id;
  perform public.notify(po.buyer_id, 'order', 'Your purchase order was delivered',
    'PO-' || po.number || ' · confirm receipt to pay the supplier, or put the payment on hold.', 'purchase_order', p_po_id::text);
end;
$$;

create function public.confirm_purchase_order(p_po_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare po public.purchase_orders;
begin
  select * into po from public.purchase_orders where id = p_po_id for update;
  if po.id is null or not private.buys_for(po) then raise exception 'purchase order not found'; end if;
  if po.status not in ('funded', 'delivered') then raise exception 'purchase order cannot be changed'; end if;
  perform private.release_purchase_order(p_po_id);
end;
$$;

-- Either side may call it off before the goods have gone.
create function public.cancel_purchase_order(p_po_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare po public.purchase_orders;
begin
  select * into po from public.purchase_orders where id = p_po_id for update;
  if po.id is null or not (private.buys_for(po) or po.supplier_id = auth.uid()) then raise exception 'purchase order not found'; end if;
  if po.status = 'pending_approval' then
    update public.purchase_orders set status = 'cancelled', closed_at = now() where id = p_po_id;
    update public.rfq_quotes set accepted = false where id = po.quote_id;
  elsif po.status = 'funded' then
    perform private.refund_purchase_order(p_po_id, 'cancelled');
  else
    raise exception 'purchase order cannot be changed';
  end if;
  perform public.notify(case when auth.uid() = po.supplier_id then po.buyer_id else po.supplier_id end, 'order',
    'A purchase order was cancelled', 'PO-' || po.number || ' · ' || po.title, 'purchase_order', p_po_id::text);
end;
$$;

-- The buyer's side disputes a delivery: the money stays held until a member
-- of staff decides.
create function public.hold_purchase_order(p_po_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare po public.purchase_orders;
begin
  select * into po from public.purchase_orders where id = p_po_id for update;
  if po.id is null or not private.buys_for(po) then raise exception 'purchase order not found'; end if;
  if po.status not in ('funded', 'delivered') then raise exception 'purchase order cannot be changed'; end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 10 and 1000 then raise exception 'hold reason required'; end if;
  update public.purchase_orders set status = 'on_hold', hold_reason = trim(p_reason) where id = p_po_id;
  perform private.notify_staff('disputes', 'dispute', 'A purchase order payment is on hold',
    'PO-' || po.number || ' · ₦' || to_char(po.amount, 'FM999,999,999'), 'admin_purchase_order', p_po_id::text);
  perform public.notify(po.supplier_id, 'dispute', 'Payment for PO-' || po.number || ' is on hold',
    'The buyer reported a problem. Our team will look at both sides.', 'purchase_order', p_po_id::text);
end;
$$;

create function public.admin_resolve_purchase_order(p_po_id uuid, p_outcome text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare po public.purchase_orders;
begin
  if not public.staff_can('disputes') then raise exception 'admins only'; end if;
  if p_outcome is null or p_outcome not in ('release', 'refund') then raise exception 'invalid outcome'; end if;
  select * into po from public.purchase_orders where id = p_po_id for update;
  if po.id is null then raise exception 'purchase order not found'; end if;
  if po.status <> 'on_hold' then raise exception 'purchase order cannot be changed'; end if;
  update public.purchase_orders set decided_by = auth.uid(), decision_note = nullif(trim(p_note), '') where id = p_po_id;
  if p_outcome = 'release' then perform private.release_purchase_order(p_po_id);
  else perform private.refund_purchase_order(p_po_id, 'refunded');
  end if;
  insert into public.admin_actions(actor_id, action, target_id, detail)
  values (auth.uid(), 'resolve_purchase_order', po.supplier_id, jsonb_build_object('po', po.number, 'outcome', p_outcome));
  perform public.notify(po.buyer_id, 'dispute', 'PO-' || po.number || ' was resolved: ' || case p_outcome when 'release' then 'supplier paid' else 'refunded' end,
    coalesce(p_note, ''), 'purchase_order', p_po_id::text);
  perform public.notify(po.supplier_id, 'dispute', 'PO-' || po.number || ' was resolved: ' || case p_outcome when 'release' then 'you have been paid' else 'refunded to the buyer' end,
    coalesce(p_note, ''), 'purchase_order', p_po_id::text);
end;
$$;

-- A supplier is paid two weeks after marking delivery if the buyer says nothing.
create function private.auto_release_purchase_orders(p_days integer default 14)
returns integer language plpgsql security definer set search_path = public as $$
declare po record; v_count integer := 0;
begin
  for po in select id from public.purchase_orders
      where status = 'delivered' and delivered_at < now() - make_interval(days => p_days) for update skip locked loop
    perform private.release_purchase_order(po.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function private.auto_release_purchase_orders(integer) from public, anon, authenticated;
do $$
begin
  if exists(select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('auto-release-purchase-orders', '45 6 * * *', 'select private.auto_release_purchase_orders()');
  else
    raise notice 'Schedule private.auto_release_purchase_orders() daily.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. The procurement summary
-- ---------------------------------------------------------------------------

-- Spend, open orders, suppliers and months for an organisation, or for the
-- caller's own purchases when p_organization_id is null.
create function public.procurement_summary(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_organization_id is not null and public.org_role(p_organization_id) is null then raise exception 'not a member of that organisation'; end if;
  return (
    with mine as (
      select * from public.purchase_orders po
      where case when p_organization_id is null then po.organization_id is null and po.buyer_id = auth.uid()
                 else po.organization_id = p_organization_id end
    )
    select jsonb_build_object(
      'spent', coalesce((select sum(amount) from mine where status = 'completed'), 0),
      'in_escrow', coalesce((select sum(escrow_held) from mine), 0),
      'awaiting_approval', (select count(*) from mine where status = 'pending_approval'),
      'open', (select count(*) from mine where status in ('funded', 'delivered', 'on_hold')),
      'completed', (select count(*) from mine where status = 'completed'),
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

revoke all on function public.create_organization(text, integer) from public, anon;
revoke all on function public.update_organization(uuid, text, integer) from public, anon;
revoke all on function public.set_organization_member(uuid, uuid, text) from public, anon;
revoke all on function public.set_organization_supplier(uuid, uuid, text, text) from public, anon;
revoke all on function public.post_rfq(uuid, text, text, text, integer, integer, jsonb) from public, anon;
revoke all on function public.accept_rfq_quote(uuid) from public, anon;
revoke all on function public.review_purchase_order(uuid, boolean, text) from public, anon;
revoke all on function public.mark_purchase_order_delivered(uuid, jsonb) from public, anon;
revoke all on function public.confirm_purchase_order(uuid) from public, anon;
revoke all on function public.cancel_purchase_order(uuid) from public, anon;
revoke all on function public.hold_purchase_order(uuid, text) from public, anon;
revoke all on function public.admin_resolve_purchase_order(uuid, text, text) from public, anon;
revoke all on function public.procurement_summary(uuid) from public, anon;
grant execute on function public.create_organization(text, integer) to authenticated;
grant execute on function public.update_organization(uuid, text, integer) to authenticated;
grant execute on function public.set_organization_member(uuid, uuid, text) to authenticated;
grant execute on function public.set_organization_supplier(uuid, uuid, text, text) to authenticated;
grant execute on function public.post_rfq(uuid, text, text, text, integer, integer, jsonb) to authenticated;
grant execute on function public.accept_rfq_quote(uuid) to authenticated;
grant execute on function public.review_purchase_order(uuid, boolean, text) to authenticated;
grant execute on function public.mark_purchase_order_delivered(uuid, jsonb) to authenticated;
grant execute on function public.confirm_purchase_order(uuid) to authenticated;
grant execute on function public.cancel_purchase_order(uuid) to authenticated;
grant execute on function public.hold_purchase_order(uuid, text) to authenticated;
grant execute on function public.admin_resolve_purchase_order(uuid, text, text) to authenticated;
grant execute on function public.procurement_summary(uuid) to authenticated;
