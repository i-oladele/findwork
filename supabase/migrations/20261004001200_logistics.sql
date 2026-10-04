-- PRD Rider Management, Route Optimization and the tracking half of Order
-- Tracking: riders apply and are approved, take deliveries, report where
-- they are, and are paid when the customer's delivery code confirms the
-- hand-over.
--
-- Arrival times here are estimates from straight-line distance, the kind of
-- vehicle and the time of day in Lagos. They are not live traffic; the
-- route-estimate Edge Function replaces them with a routed, traffic-aware
-- time once a maps key is configured.

-- Support staff run logistics alongside orders.
create or replace function public.staff_can(p_area text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select case staff_role
      when 'admin' then true
      when 'moderator' then p_area in ('console', 'lookup', 'disputes', 'moderation', 'verification', 'users', 'risk')
      when 'finance' then p_area in ('console', 'lookup', 'finance', 'analytics', 'risk')
      when 'support' then p_area in ('console', 'lookup', 'support', 'orders', 'logistics')
      else false end
    from public.profiles where id = auth.uid() and deleted_at is null and suspended_at is null), false);
$$;

create or replace function private.notify_staff(p_area text, p_kind text, p_title text, p_body text, p_ref_type text, p_ref_id text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (profile_id, kind, title, body, ref_type, ref_id)
  select id, p_kind, p_title, p_body, p_ref_type, p_ref_id
  from public.profiles
  where deleted_at is null and suspended_at is null and (
    staff_role = 'admin'
    or (staff_role = 'moderator' and p_area in ('disputes', 'moderation', 'verification', 'users', 'risk'))
    or (staff_role = 'finance' and p_area in ('finance', 'analytics', 'risk'))
    or (staff_role = 'support' and p_area in ('support', 'orders', 'logistics')));
$$;

-- ---------------------------------------------------------------------------
-- 1. Riders
-- ---------------------------------------------------------------------------

create table public.rider_profiles (
  id uuid primary key references public.profiles(id) on delete cascade,
  vehicle text not null check (vehicle in ('bicycle', 'motorcycle', 'car', 'van')),
  plate text check (plate is null or char_length(plate) between 3 and 12),
  area text references public.service_areas(name),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  online boolean not null default false,
  -- Where the rider last reported being. Shared only with the people on a
  -- delivery they are carrying, and only while they carry it.
  lat numeric(8, 5),
  lng numeric(8, 5),
  located_at timestamptz,
  deliveries_done integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.rider_profiles enable row level security;
revoke all on public.rider_profiles from anon, authenticated;
grant select on public.rider_profiles to authenticated;
create policy "Riders and logistics staff read rider profiles" on public.rider_profiles for select to authenticated
  using (id = auth.uid() or public.staff_can('logistics'));

create function public.apply_as_rider(p_vehicle text, p_plate text, p_area text)
returns void language plpgsql security definer set search_path = public as $$
declare v_plate text := nullif(upper(regexp_replace(coalesce(p_plate, ''), '[^0-9A-Za-z]', '', 'g')), '');
begin
  perform 1 from public.profiles where id = auth.uid() and deleted_at is null and suspended_at is null for update;
  if not found then raise exception 'not authenticated'; end if;
  if p_vehicle is null or p_vehicle not in ('bicycle', 'motorcycle', 'car', 'van') then raise exception 'invalid vehicle'; end if;
  if p_vehicle <> 'bicycle' and (v_plate is null or char_length(v_plate) not between 3 and 12) then raise exception 'plate required'; end if;
  if p_area is not null and not exists(select 1 from public.service_areas where name = p_area) then raise exception 'invalid area'; end if;
  insert into public.rider_profiles(id, vehicle, plate, area) values (auth.uid(), p_vehicle, v_plate, p_area)
  on conflict (id) do update set vehicle = excluded.vehicle, plate = excluded.plate, area = excluded.area,
    -- Changing the vehicle of a rejected application sends it back for review.
    status = case when public.rider_profiles.status = 'rejected' then 'pending' else public.rider_profiles.status end;
  if (select status from public.rider_profiles where id = auth.uid()) = 'pending' then
    perform private.notify_staff('logistics', 'system', 'Rider application to review', p_vehicle, 'admin_rider', auth.uid()::text);
  end if;
end;
$$;

create function public.admin_review_rider(p_rider_id uuid, p_approve boolean, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_rider public.rider_profiles;
begin
  if not public.staff_can('logistics') then raise exception 'admins only'; end if;
  select * into v_rider from public.rider_profiles where id = p_rider_id for update;
  if v_rider.id is null then raise exception 'rider not found'; end if;
  if not coalesce(p_approve, false) and char_length(trim(coalesce(p_note, ''))) < 3 then raise exception 'rejection reason required'; end if;
  update public.rider_profiles
  set status = case when p_approve then 'approved' else 'rejected' end, note = nullif(trim(p_note), ''),
      reviewed_by = auth.uid(), reviewed_at = now(), online = case when p_approve then online else false end
  where id = p_rider_id;
  insert into public.admin_actions(actor_id, action, target_id, detail)
  values (auth.uid(), case when p_approve then 'approve_rider' else 'reject_rider' end, p_rider_id, jsonb_build_object('note', nullif(trim(p_note), '')));
  perform public.notify(p_rider_id, 'system',
    case when p_approve then 'You can now deliver for FindWork' else 'Your rider application was not approved' end,
    case when p_approve then 'Go online from the rider screen to see deliveries near you.' else coalesce(nullif(trim(p_note), ''), '') end,
    'rider', null);
end;
$$;

create function private.active_rider()
returns public.rider_profiles language plpgsql security definer set search_path = public as $$
declare v_rider public.rider_profiles;
begin
  select r.* into v_rider from public.rider_profiles r join public.profiles p on p.id = r.id
  where r.id = auth.uid() and r.status = 'approved' and p.deleted_at is null and p.suspended_at is null;
  if v_rider.id is null then raise exception 'not an approved rider'; end if;
  return v_rider;
end;
$$;
revoke all on function private.active_rider() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Deliveries
-- ---------------------------------------------------------------------------

create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  rider_id uuid references public.rider_profiles(id),
  status text not null default 'awaiting_rider'
    check (status in ('awaiting_rider', 'assigned', 'picked_up', 'delivered', 'cancelled')),
  pickup_address text,
  pickup_lat numeric(8, 5),
  pickup_lng numeric(8, 5),
  dropoff_address text not null,
  dropoff_lat numeric(8, 5),
  dropoff_lng numeric(8, 5),
  -- What the rider earns: their share of the delivery fee the customer paid.
  rider_fee integer not null check (rider_fee >= 0),
  -- Shown to the customer only. The rider needs it to complete the delivery,
  -- so the parcel has to reach the person holding it.
  code text not null,
  code_attempts smallint not null default 0,
  eta_minutes integer,
  eta_at timestamptz,
  eta_source text not null default 'estimate' check (eta_source in ('estimate', 'routed')),
  assigned_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);
create index deliveries_queue on public.deliveries(status, created_at);
create index deliveries_rider on public.deliveries(rider_id, status);
alter table public.deliveries enable row level security;
revoke all on public.deliveries from anon, authenticated;
-- Every column but the code.
grant select (id, order_id, rider_id, status, pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng,
  rider_fee, eta_minutes, eta_at, eta_source, assigned_at, picked_up_at, delivered_at, created_at)
  on public.deliveries to authenticated;
create policy "The rider, the order's two sides and logistics staff read a delivery" on public.deliveries for select to authenticated
  using (rider_id = auth.uid() or public.staff_can('logistics')
    or exists(select 1 from public.orders o where o.id = order_id and auth.uid() in (o.customer_id, o.seller_id)));

-- Minutes to cover a distance: speed by vehicle, slowed by the time of day.
-- Lagos mornings and evenings are far slower than midday or night.
create function private.travel_minutes(p_km numeric, p_vehicle text, p_at timestamptz)
returns integer language sql immutable as $$
  select ceil(
    coalesce(p_km, 0) * 1.3 -- roads are longer than the straight line
    / (case p_vehicle when 'bicycle' then 12 when 'motorcycle' then 28 when 'car' then 22 when 'van' then 18 else 20 end)::numeric
    * 60
    * (case
        when extract(isodow from p_at at time zone 'Africa/Lagos') >= 6 then 1.15
        when extract(hour from p_at at time zone 'Africa/Lagos') between 7 and 9 then 1.7
        when extract(hour from p_at at time zone 'Africa/Lagos') between 16 and 19 then 1.8
        when extract(hour from p_at at time zone 'Africa/Lagos') between 10 and 15 then 1.25
        else 1.0 end)
  )::integer;
$$;

create function private.refresh_delivery_eta(p_delivery_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d public.deliveries; r public.rider_profiles; v_minutes integer;
begin
  select * into d from public.deliveries where id = p_delivery_id;
  if d.id is null or d.status not in ('assigned', 'picked_up') or d.eta_source = 'routed' then return; end if;
  select * into r from public.rider_profiles where id = d.rider_id;
  if r.lat is null or d.dropoff_lat is null then
    update public.deliveries set eta_minutes = null, eta_at = null where id = p_delivery_id;
    return;
  end if;
  if d.status = 'picked_up' then
    v_minutes := private.travel_minutes(private.km_between(r.lat, r.lng, d.dropoff_lat, d.dropoff_lng)::numeric, r.vehicle, now());
  elsif d.pickup_lat is null then
    v_minutes := private.travel_minutes(private.km_between(r.lat, r.lng, d.dropoff_lat, d.dropoff_lng)::numeric, r.vehicle, now()) + 10;
  else
    -- To the seller, ten minutes to collect, then on to the customer.
    v_minutes := private.travel_minutes(private.km_between(r.lat, r.lng, d.pickup_lat, d.pickup_lng)::numeric, r.vehicle, now()) + 10
      + private.travel_minutes(private.km_between(d.pickup_lat, d.pickup_lng, d.dropoff_lat, d.dropoff_lng)::numeric, r.vehicle, now());
  end if;
  update public.deliveries set eta_minutes = v_minutes, eta_at = now() + make_interval(mins => v_minutes) where id = p_delivery_id;
end;
$$;
revoke all on function private.refresh_delivery_eta(uuid) from public, anon, authenticated;

create function private.pay_rider(p_delivery public.deliveries)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_delivery.rider_id is null then return; end if;
  if p_delivery.rider_fee > 0 then
    insert into public.wallet_transactions(profile_id, label, kind, balance_delta, order_id)
    values (p_delivery.rider_id, 'Delivery · order #' || upper(left(p_delivery.order_id::text, 8)), 'delivery', p_delivery.rider_fee, p_delivery.order_id);
  end if;
  update public.rider_profiles set deliveries_done = deliveries_done + 1 where id = p_delivery.rider_id;
  perform public.notify(p_delivery.rider_id, 'payment', 'Delivery paid',
    '₦' || to_char(p_delivery.rider_fee, 'FM999,999,999') || ' for order #' || upper(left(p_delivery.order_id::text, 8)), 'wallet', null);
end;
$$;
revoke all on function private.pay_rider(public.deliveries) from public, anon, authenticated;

-- An order that is dispatched needs a rider; one that closes some other way
-- closes its delivery with it.
create function private.sync_delivery()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_pickup record;
  v_drop record;
  d public.deliveries;
begin
  if new.status = 'dispatched' and old.status = 'placed' then
    select pp.location as address, pp.lat, pp.lng into v_pickup from public.provider_profiles pp where pp.id = new.seller_id;
    select p.lat, p.lng into v_drop from public.profiles p where p.id = new.customer_id;
    insert into public.deliveries(order_id, pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng, rider_fee, code)
    values (new.id, coalesce(v_pickup.address, 'FindWork fulfilment'), v_pickup.lat, v_pickup.lng,
      coalesce(new.delivery_address, ''), v_drop.lat, v_drop.lng,
      -- The rider's share of the delivery fee; the rest covers the platform.
      round(new.delivery_fee * 0.8),
      lpad((('x' || substr(md5(gen_random_uuid()::text), 1, 6))::bit(24)::integer % 10000)::text, 4, '0'))
    on conflict (order_id) do nothing;
    -- Tell riders who are online; the nearest see it first in their list.
    insert into public.notifications(profile_id, kind, title, body, ref_type, ref_id)
    select r.id, 'order', 'New delivery available', coalesce(v_pickup.address, 'FindWork fulfilment') || ' → ' || left(coalesce(new.delivery_address, ''), 60), 'rider', null
    from public.rider_profiles r join public.profiles p on p.id = r.id
    where r.status = 'approved' and r.online and p.deleted_at is null and p.suspended_at is null
    limit 25;
  elsif new.status = 'delivered' and old.status <> 'delivered' then
    select * into d from public.deliveries where order_id = new.id for update;
    if d.id is not null and d.status in ('awaiting_rider', 'assigned', 'picked_up') then
      if d.status = 'picked_up' then
        -- The customer confirmed in the app instead of giving the code; the
        -- rider who carried it is still paid.
        update public.deliveries set status = 'delivered', delivered_at = now(), eta_minutes = null, eta_at = null where id = d.id;
        perform private.pay_rider(d);
      else
        update public.deliveries set status = 'cancelled', eta_minutes = null, eta_at = null where id = d.id;
      end if;
    end if;
  elsif new.status in ('cancelled', 'returned') and old.status in ('placed', 'dispatched') then
    update public.deliveries set status = 'cancelled', eta_minutes = null, eta_at = null
    where order_id = new.id and status in ('awaiting_rider', 'assigned', 'picked_up');
  end if;
  return new;
end;
$$;
create trigger orders_sync_delivery after update of status on public.orders
  for each row execute function private.sync_delivery();

-- ---------------------------------------------------------------------------
-- 3. What a rider does
-- ---------------------------------------------------------------------------

create function public.set_rider_online(p_online boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform private.active_rider();
  update public.rider_profiles set online = coalesce(p_online, false) where id = auth.uid();
end;
$$;

create function public.update_rider_location(p_lat double precision, p_lng double precision)
returns void language plpgsql security definer set search_path = public as $$
declare d record;
begin
  perform private.active_rider();
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid location';
  end if;
  update public.rider_profiles set lat = round(p_lat::numeric, 5), lng = round(p_lng::numeric, 5), located_at = now() where id = auth.uid();
  for d in select id from public.deliveries where rider_id = auth.uid() and status in ('assigned', 'picked_up') loop
    perform private.refresh_delivery_eta(d.id);
  end loop;
end;
$$;

-- Deliveries waiting for a rider, nearest pickup first. No customer contact
-- details until one is accepted.
create function public.rider_available_deliveries()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_rider public.rider_profiles := private.active_rider();
begin
  return coalesce((
    select jsonb_agg(row order by (row->>'pickup_km')::numeric nulls last, row->>'created_at')
    from (
      select jsonb_build_object(
        'id', d.id, 'pickup_address', d.pickup_address, 'dropoff_area', left(coalesce(nullif(split_part(d.dropoff_address, E'\n', 2), ''), d.dropoff_address), 60),
        'rider_fee', d.rider_fee, 'delivery_speed', o.delivery_speed, 'created_at', d.created_at,
        'pickup_km', case when v_rider.lat is not null and d.pickup_lat is not null
          then round(private.km_between(v_rider.lat, v_rider.lng, d.pickup_lat, d.pickup_lng)::numeric, 1) end,
        'trip_km', case when d.pickup_lat is not null and d.dropoff_lat is not null
          then round(private.km_between(d.pickup_lat, d.pickup_lng, d.dropoff_lat, d.dropoff_lng)::numeric, 1) end) as row
      from public.deliveries d join public.orders o on o.id = d.order_id
      where d.status = 'awaiting_rider' and o.status = 'dispatched'
        -- A rider cannot deliver an order they bought or sold.
        and v_rider.id not in (o.customer_id, coalesce(o.seller_id, o.customer_id))
      order by d.created_at limit 50
    ) rows), '[]'::jsonb);
end;
$$;

create function private.assign_delivery(p_delivery_id uuid, p_rider_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d public.deliveries; o public.orders; r public.rider_profiles;
begin
  select * into d from public.deliveries where id = p_delivery_id for update;
  if d.id is null then raise exception 'delivery not found'; end if;
  if d.status <> 'awaiting_rider' then raise exception 'delivery already taken'; end if;
  select * into o from public.orders where id = d.order_id;
  if o.status <> 'dispatched' then raise exception 'order is closed'; end if;
  if p_rider_id in (o.customer_id, coalesce(o.seller_id, o.customer_id)) then raise exception 'cannot deliver your own order'; end if;
  select * into r from public.rider_profiles where id = p_rider_id and status = 'approved';
  if r.id is null then raise exception 'rider not found'; end if;
  if (select count(*) from public.deliveries where rider_id = p_rider_id and status in ('assigned', 'picked_up')) >= 5 then
    raise exception 'too many active deliveries';
  end if;
  update public.deliveries set rider_id = p_rider_id, status = 'assigned', assigned_at = now() where id = p_delivery_id;
  perform private.refresh_delivery_eta(p_delivery_id);
  perform public.notify(o.customer_id, 'order', 'A rider is on the way to collect your order',
    'Order #' || upper(left(o.id::text, 8)) || ' · track it and keep your delivery code ready.', 'track', o.id::text);
  if o.seller_id is not null then
    perform public.notify(o.seller_id, 'order', 'A rider is coming for an order',
      'Order #' || upper(left(o.id::text, 8)), 'seller_order', o.id::text);
  end if;
end;
$$;
revoke all on function private.assign_delivery(uuid, uuid) from public, anon, authenticated;

create function public.accept_delivery(p_delivery_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform private.active_rider();
  perform private.assign_delivery(p_delivery_id, auth.uid());
end;
$$;

create function public.admin_assign_delivery(p_delivery_id uuid, p_rider_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.staff_can('logistics') then raise exception 'admins only'; end if;
  perform private.assign_delivery(p_delivery_id, p_rider_id);
  perform public.notify(p_rider_id, 'order', 'A delivery was assigned to you', 'Open the rider screen for the details.', 'rider', null);
end;
$$;

-- A rider who cannot do a job hands it back before collecting it.
create function public.release_delivery(p_delivery_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d public.deliveries;
begin
  select * into d from public.deliveries where id = p_delivery_id for update;
  if d.id is null or (d.rider_id is distinct from auth.uid() and not public.staff_can('logistics')) then raise exception 'delivery not found'; end if;
  if d.status <> 'assigned' then raise exception 'delivery already collected'; end if;
  update public.deliveries set rider_id = null, status = 'awaiting_rider', assigned_at = null, eta_minutes = null, eta_at = null, eta_source = 'estimate'
  where id = p_delivery_id;
end;
$$;

create function public.mark_delivery_picked_up(p_delivery_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d public.deliveries; o public.orders;
begin
  perform private.active_rider();
  select * into d from public.deliveries where id = p_delivery_id for update;
  if d.id is null or d.rider_id is distinct from auth.uid() then raise exception 'delivery not found'; end if;
  if d.status <> 'assigned' then raise exception 'delivery already collected'; end if;
  update public.deliveries set status = 'picked_up', picked_up_at = now(), eta_source = 'estimate' where id = p_delivery_id;
  perform private.refresh_delivery_eta(p_delivery_id);
  select * into o from public.orders where id = d.order_id;
  perform public.notify(o.customer_id, 'order', 'Your rider has your order',
    'Order #' || upper(left(o.id::text, 8)) || ' · give the rider your delivery code when it arrives.', 'track', o.id::text);
end;
$$;

-- The customer reads their code to the rider. A right code hands the order
-- over: the rider is paid and, for a seller's order, so is the seller.
create function public.complete_delivery(p_delivery_id uuid, p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare d public.deliveries; o public.orders;
begin
  perform private.active_rider();
  select * into d from public.deliveries where id = p_delivery_id;
  if d.id is null or d.rider_id is distinct from auth.uid() then raise exception 'delivery not found'; end if;
  -- Order first, then delivery: the same order every other path locks in.
  select * into o from public.orders where id = d.order_id for update;
  select * into d from public.deliveries where id = p_delivery_id for update;
  if d.status <> 'picked_up' then raise exception 'collect the order first'; end if;
  if d.code_attempts >= 5 then raise exception 'delivery code locked'; end if;
  if regexp_replace(coalesce(p_code, ''), '\D', '', 'g') <> d.code then
    update public.deliveries set code_attempts = code_attempts + 1 where id = p_delivery_id;
    -- Committed with the failed attempt, so guesses are counted.
    return;
  end if;
  update public.deliveries set status = 'delivered', delivered_at = now(), eta_minutes = null, eta_at = null where id = p_delivery_id;
  perform private.pay_rider(d);
  if o.status in ('placed', 'dispatched') and not private.open_dispute_exists('order', o.id::text) then
    perform private.release_order(o);
    perform public.notify(o.customer_id, 'order', 'Your order was delivered', 'Order #' || upper(left(o.id::text, 8)), 'order', o.id::text);
  end if;
end;
$$;

-- complete_delivery returns quietly on a wrong code so the attempt is kept;
-- this tells the rider what happened.
create function public.delivery_outcome(p_delivery_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('status', status, 'attempts_left', greatest(0, 5 - code_attempts))
  from public.deliveries where id = p_delivery_id and (rider_id = auth.uid() or public.staff_can('logistics'));
$$;

-- ---------------------------------------------------------------------------
-- 4. Tracking
-- ---------------------------------------------------------------------------

-- The customer may pin exactly where to deliver, which sharpens the estimate.
create function public.set_delivery_dropoff(p_order_id uuid, p_lat double precision, p_lng double precision)
returns void language plpgsql security definer set search_path = public as $$
declare d public.deliveries;
begin
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid location';
  end if;
  select d2.* into d from public.deliveries d2 join public.orders o on o.id = d2.order_id
  where d2.order_id = p_order_id and o.customer_id = auth.uid() for update of d2;
  if d.id is null then raise exception 'delivery not found'; end if;
  if d.status not in ('awaiting_rider', 'assigned', 'picked_up') then raise exception 'delivery already closed'; end if;
  update public.deliveries set dropoff_lat = round(p_lat::numeric, 5), dropoff_lng = round(p_lng::numeric, 5), eta_source = 'estimate' where id = d.id;
  perform private.refresh_delivery_eta(d.id);
end;
$$;

-- One delivery, as each person involved is allowed to see it. The rider's
-- position is shared only while they carry the order and only if it is fresh.
create function public.delivery_tracking(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d public.deliveries; o public.orders; r public.rider_profiles; v_rider_name text; v_live boolean;
begin
  select * into o from public.orders where id = p_order_id;
  select * into d from public.deliveries where order_id = p_order_id;
  if o.id is null or d.id is null then return null; end if;
  if auth.uid() is null or not (auth.uid() in (o.customer_id, coalesce(o.seller_id, o.customer_id), coalesce(d.rider_id, o.customer_id))
      or public.staff_can('logistics')) then
    raise exception 'order not found';
  end if;
  select * into r from public.rider_profiles where id = d.rider_id;
  select split_part(full_name, ' ', 1) into v_rider_name from public.profiles where id = d.rider_id;
  v_live := d.status in ('assigned', 'picked_up') and r.located_at > now() - interval '10 minutes';
  return jsonb_build_object(
    'id', d.id, 'order_id', d.order_id, 'status', d.status,
    'pickup_address', d.pickup_address, 'pickup_lat', d.pickup_lat, 'pickup_lng', d.pickup_lng,
    'dropoff_address', d.dropoff_address, 'dropoff_lat', d.dropoff_lat, 'dropoff_lng', d.dropoff_lng,
    'eta_minutes', d.eta_minutes, 'eta_at', d.eta_at, 'eta_source', d.eta_source,
    'assigned_at', d.assigned_at, 'picked_up_at', d.picked_up_at, 'delivered_at', d.delivered_at,
    'rider', case when d.rider_id is null then null else jsonb_build_object(
      'name', coalesce(nullif(v_rider_name, ''), 'Your rider'), 'vehicle', r.vehicle, 'plate', r.plate, 'deliveries_done', r.deliveries_done,
      'lat', case when v_live then r.lat end, 'lng', case when v_live then r.lng end,
      'located_at', case when v_live then r.located_at end) end,
    -- Only the customer holds the code.
    'code', case when auth.uid() = o.customer_id and d.status in ('awaiting_rider', 'assigned', 'picked_up') then d.code end,
    -- Only the rider carrying it gets the customer's number.
    'contact_phone', case when auth.uid() = d.rider_id and d.status in ('assigned', 'picked_up') then o.contact_phone end,
    'rider_fee', case when auth.uid() = d.rider_id or public.staff_can('logistics') then d.rider_fee end);
end;
$$;

-- Service role only: the route-estimate function stores a routed time here.
create function public.set_delivery_route(p_delivery_id uuid, p_minutes integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_minutes is null or p_minutes not between 1 and 1440 then raise exception 'invalid route'; end if;
  update public.deliveries set eta_minutes = p_minutes, eta_at = now() + make_interval(mins => p_minutes), eta_source = 'routed'
  where id = p_delivery_id and status in ('assigned', 'picked_up');
end;
$$;

revoke all on function public.apply_as_rider(text, text, text) from public, anon;
revoke all on function public.admin_review_rider(uuid, boolean, text) from public, anon;
revoke all on function public.set_rider_online(boolean) from public, anon;
revoke all on function public.update_rider_location(double precision, double precision) from public, anon;
revoke all on function public.rider_available_deliveries() from public, anon;
revoke all on function public.accept_delivery(uuid) from public, anon;
revoke all on function public.admin_assign_delivery(uuid, uuid) from public, anon;
revoke all on function public.release_delivery(uuid) from public, anon;
revoke all on function public.mark_delivery_picked_up(uuid) from public, anon;
revoke all on function public.complete_delivery(uuid, text) from public, anon;
revoke all on function public.delivery_outcome(uuid) from public, anon;
revoke all on function public.set_delivery_dropoff(uuid, double precision, double precision) from public, anon;
revoke all on function public.delivery_tracking(uuid) from public, anon;
revoke all on function public.set_delivery_route(uuid, integer) from public, anon, authenticated;
grant execute on function public.apply_as_rider(text, text, text) to authenticated;
grant execute on function public.admin_review_rider(uuid, boolean, text) to authenticated;
grant execute on function public.set_rider_online(boolean) to authenticated;
grant execute on function public.update_rider_location(double precision, double precision) to authenticated;
grant execute on function public.rider_available_deliveries() to authenticated;
grant execute on function public.accept_delivery(uuid) to authenticated;
grant execute on function public.admin_assign_delivery(uuid, uuid) to authenticated;
grant execute on function public.release_delivery(uuid) to authenticated;
grant execute on function public.mark_delivery_picked_up(uuid) to authenticated;
grant execute on function public.complete_delivery(uuid, text) to authenticated;
grant execute on function public.delivery_outcome(uuid) to authenticated;
grant execute on function public.set_delivery_dropoff(uuid, double precision, double precision) to authenticated;
grant execute on function public.delivery_tracking(uuid) to authenticated;
grant execute on function public.set_delivery_route(uuid, integer) to service_role;
