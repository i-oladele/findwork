-- Business-logic RPC functions. Each wraps a rule the client must not be
-- able to fake or bypass — money movement, atomicity across tables, or
-- derived state (progress, escrow) — mirroring appStore.ts's action list.
-- Simple single-table, ownership-checked writes (posting a job, sending a
-- quote, posting an RFQ/classified, sending a chat message, opening a
-- dispute, toggling a provider's own service/availability) are instead
-- covered by the RLS insert/update policies already defined per table —
-- equally impossible to bypass from devtools, without the extra
-- indirection of an RPC around a single insert.

create function public.add_money(p_amount integer)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;
  insert into public.wallet_transactions (profile_id, label, kind, balance_delta)
  values (auth.uid(), 'Top-up · Providus transfer', 'topup', p_amount);
end;
$$;

create function public.pay_booking(
  p_provider_id uuid,
  p_service text,
  p_price integer,
  p_start_at timestamptz,
  p_duration_minutes integer default 60
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_provider_name text;
  v_fee integer;
  v_total integer;
  v_balance bigint;
  v_booking_id uuid;
begin
  select business_name into v_provider_name from public.provider_profiles where id = p_provider_id;
  if v_provider_name is null then
    raise exception 'provider not found';
  end if;

  v_fee := round(p_price * 0.05);
  v_total := p_price + v_fee;

  select balance into v_balance from public.wallet_summary(auth.uid());
  if v_balance < v_total then
    raise exception 'insufficient_balance';
  end if;

  -- Raises an exclusion-constraint violation (23P01) if this provider
  -- already has an overlapping pending/active booking at this slot —
  -- the double-booking guard a client-only store could never enforce.
  insert into public.bookings (provider_id, provider_name, customer_id, service, price, fee, start_at, duration_minutes, status, escrow_held)
  values (p_provider_id, v_provider_name, auth.uid(), p_service, p_price, v_fee, p_start_at, p_duration_minutes, 'active', v_total)
  returning id into v_booking_id;

  insert into public.wallet_transactions (profile_id, label, kind, balance_delta, escrow_delta, booking_id)
  values (auth.uid(), 'Escrow · ' || v_provider_name, 'escrow', -v_total, v_total, v_booking_id);

  return v_booking_id;
end;
$$;

create function public.complete_booking(p_booking_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_booking public.bookings;
begin
  select * into v_booking from public.bookings where id = p_booking_id;
  if v_booking is null then
    raise exception 'booking not found';
  end if;
  if v_booking.customer_id <> auth.uid() then
    raise exception 'not your booking';
  end if;
  if v_booking.status = 'done' then
    return;
  end if;

  update public.bookings set status = 'done' where id = p_booking_id;

  insert into public.wallet_transactions (profile_id, label, kind, escrow_delta, booking_id)
  values (auth.uid(), 'Released to ' || v_booking.provider_name, 'release', -v_booking.escrow_held, p_booking_id);
end;
$$;

create function public.place_order(
  p_items jsonb, -- [{product_id, qty}, ...]
  p_delivery_speed text
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_delivery_fee integer;
  v_items_total integer := 0;
  v_total integer;
  v_balance bigint;
  v_order_id uuid;
  v_item record;
begin
  if p_delivery_speed not in ('same-day', 'standard') then
    raise exception 'invalid delivery speed';
  end if;
  v_delivery_fee := case p_delivery_speed when 'same-day' then 1800 else 1200 end;

  create temporary table _order_lines (product_id text, name text, price integer, qty integer) on commit drop;

  for v_item in select * from jsonb_to_recordset(p_items) as x(product_id text, qty integer)
  loop
    insert into _order_lines (product_id, name, price, qty)
    select p.id, p.name, p.price, v_item.qty
    from public.products p
    where p.id = v_item.product_id;
  end loop;

  select coalesce(sum(price * qty), 0) into v_items_total from _order_lines;
  v_total := v_items_total + v_delivery_fee;

  select balance into v_balance from public.wallet_summary(auth.uid());
  if v_balance < v_total then
    raise exception 'insufficient_balance';
  end if;

  insert into public.orders (customer_id, total, delivery_speed)
  values (auth.uid(), v_total, p_delivery_speed)
  returning id into v_order_id;

  insert into public.order_items (order_id, product_id, name, price, qty)
  select v_order_id, product_id, name, price, qty from _order_lines;

  insert into public.wallet_transactions (profile_id, label, kind, balance_delta, order_id)
  values (auth.uid(), 'Order ' || v_order_id, 'order', -v_total, v_order_id);

  return v_order_id;
end;
$$;

create function public.enroll_in_course(p_course_id text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.enrollments (profile_id, course_id, progress)
  values (auth.uid(), p_course_id, 0)
  on conflict (profile_id, course_id) do nothing;
end;
$$;

create function public.advance_progress(p_course_id text, p_lesson_count integer)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_step integer;
begin
  v_step := ceil(100.0 / greatest(1, p_lesson_count));
  update public.enrollments
  set progress = least(100, progress + v_step)
  where profile_id = auth.uid() and course_id = p_course_id;
end;
$$;

create function public.subscribe_plan(p_plan text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_price integer;
  v_name text;
  v_balance bigint;
begin
  select price, name into v_price, v_name from public.subscription_plans where id = p_plan;
  if v_name is null then
    raise exception 'plan not found';
  end if;

  if v_price > 0 then
    select balance into v_balance from public.wallet_summary(auth.uid());
    if v_balance < v_price then
      raise exception 'insufficient_balance';
    end if;
  end if;

  insert into public.subscriptions (profile_id, plan, since)
  values (auth.uid(), p_plan, now())
  on conflict (profile_id) do update set plan = excluded.plan, since = excluded.since;

  if v_price > 0 then
    insert into public.wallet_transactions (profile_id, label, kind, balance_delta)
    values (auth.uid(), v_name || ' plan subscription', 'subscription', -v_price);
  end if;
end;
$$;

create function public.respond_to_request(p_request_id uuid, p_accept boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_provider_id uuid;
begin
  select provider_id into v_provider_id from public.provider_requests where id = p_request_id;
  if v_provider_id is null then
    raise exception 'request not found';
  end if;
  if v_provider_id <> auth.uid() then
    raise exception 'not your request';
  end if;

  update public.provider_requests
  set status = case when p_accept then 'accepted' else 'declined' end
  where id = p_request_id;
end;
$$;

create function public.accept_rfq_quote(p_quote_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_rfq_id uuid;
  v_buyer_id uuid;
begin
  select q.rfq_id, r.buyer_id into v_rfq_id, v_buyer_id
  from public.rfq_quotes q
  join public.rfqs r on r.id = q.rfq_id
  where q.id = p_quote_id;

  if v_rfq_id is null then
    raise exception 'quote not found';
  end if;
  if v_buyer_id <> auth.uid() then
    raise exception 'not your RFQ';
  end if;

  update public.rfq_quotes set accepted = true where id = p_quote_id;
  update public.rfq_quotes set accepted = false where rfq_id = v_rfq_id and id <> p_quote_id;
  update public.rfqs set status = 'closed' where id = v_rfq_id;
end;
$$;
