-- Orders gain a delivery address, a cancel path and a status an operator can
-- move forward. Courses charge what they cost, and progress is counted from
-- lessons actually completed rather than a lesson count the client supplies.

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------

alter table public.orders
  add column delivery_address text,
  add column contact_phone text,
  add column delivery_fee integer not null default 0,
  add column updated_at timestamptz not null default now();

alter table public.orders drop constraint orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('placed', 'dispatched', 'delivered', 'returned', 'cancelled'));

create index orders_customer_idx on public.orders (customer_id, placed_at desc);

drop function public.place_order(jsonb, text);

create function public.place_order(p_items jsonb, p_delivery_speed text, p_address text, p_phone text)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_delivery_fee integer;
  v_items_total integer;
  v_total integer;
  v_order_id uuid;
  v_bad_qty boolean;
  v_missing boolean;
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

  -- Prices come from the catalog; the client sends only ids and quantities.
  select
    bool_or(x.qty is null or x.qty < 1 or x.qty > 99),
    bool_or(p.id is null),
    sum(p.price * x.qty)
  into v_bad_qty, v_missing, v_items_total
  from jsonb_to_recordset(p_items) as x(product_id text, qty integer)
  left join public.products p on p.id = x.product_id;

  if v_bad_qty then
    raise exception 'invalid quantity';
  end if;
  if v_missing then
    raise exception 'product not found';
  end if;

  v_total := v_items_total + v_delivery_fee;

  if private.locked_balance(auth.uid()) < v_total then
    raise exception 'insufficient_balance';
  end if;

  insert into public.orders (customer_id, total, delivery_speed, delivery_fee, delivery_address, contact_phone)
  values (auth.uid(), v_total, p_delivery_speed, v_delivery_fee, trim(p_address), nullif(trim(p_phone), ''))
  returning id into v_order_id;

  insert into public.order_items (order_id, product_id, name, price, qty)
  select v_order_id, p.id, p.name, p.price, x.qty
  from jsonb_to_recordset(p_items) as x(product_id text, qty integer)
  join public.products p on p.id = x.product_id;

  insert into public.wallet_transactions (profile_id, label, kind, balance_delta, order_id)
  values (auth.uid(), 'Order #' || upper(left(v_order_id::text, 8)), 'order', -v_total, v_order_id);

  perform private.notify_admins('order', 'New order to fulfil',
    '#' || upper(left(v_order_id::text, 8)) || ' · ₦' || to_char(v_total, 'FM999,999,999'),
    'admin_order', v_order_id::text);

  return v_order_id;
end;
$$;

create function private.refund_order(p_order public.orders, p_status text, p_label text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.orders set status = p_status, updated_at = now() where id = p_order.id;
  insert into public.wallet_transactions (profile_id, label, kind, balance_delta, order_id)
  values (p_order.customer_id, p_label, 'refund', p_order.total, p_order.id);
end;
$$;

-- An order can be cancelled for a full refund until it leaves the vendor.
create function public.cancel_order(p_order_id uuid)
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
  if v_order.customer_id <> auth.uid() then
    raise exception 'not your order';
  end if;
  if v_order.status <> 'placed' then
    raise exception 'order already dispatched';
  end if;
  if private.open_dispute_exists('order', p_order_id::text) then
    raise exception 'dispute_open';
  end if;

  perform private.refund_order(v_order, 'cancelled', 'Refund · order #' || upper(left(p_order_id::text, 8)));
end;
$$;

-- Fulfilment is done by the FindWork team for now: products are a
-- first-party catalog with no vendor accounts behind them.
create function public.admin_set_order_status(p_order_id uuid, p_status text)
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

  update public.orders set status = p_status, updated_at = now() where id = p_order_id;

  perform public.notify(v_order.customer_id, 'order',
    case p_status when 'dispatched' then 'Your order is on the way' else 'Your order was delivered' end,
    'Order #' || upper(left(p_order_id::text, 8)), 'order', p_order_id::text);
end;
$$;

-- ---------------------------------------------------------------------------
-- Learning
-- ---------------------------------------------------------------------------

-- The lesson itself. Empty until someone writes the course content.
alter table public.course_lessons add column body text;

create table public.lesson_completions (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  lesson_id uuid not null references public.course_lessons (id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (profile_id, lesson_id)
);

alter table public.lesson_completions enable row level security;

create policy "Users see their own lesson completions"
  on public.lesson_completions for select
  to authenticated
  using (profile_id = auth.uid());

-- Paid courses now charge the wallet. Enrolling twice never charges twice.
create or replace function public.enroll_in_course(p_course_id text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_course public.courses;
begin
  select * into v_course from public.courses where id = p_course_id;
  if v_course is null then
    raise exception 'course not found';
  end if;

  if exists (select 1 from public.enrollments where profile_id = auth.uid() and course_id = p_course_id) then
    return;
  end if;

  if v_course.price > 0 then
    if private.locked_balance(auth.uid()) < v_course.price then
      raise exception 'insufficient_balance';
    end if;
    insert into public.wallet_transactions (profile_id, label, kind, balance_delta)
    values (auth.uid(), 'Course · ' || v_course.title, 'course', -v_course.price);
  end if;

  insert into public.enrollments (profile_id, course_id, progress)
  values (auth.uid(), p_course_id, 0);
end;
$$;

drop function public.advance_progress(text, integer);

create function public.complete_lesson(p_lesson_id uuid)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_course_id text;
  v_total integer;
  v_done integer;
  v_progress integer;
begin
  select course_id into v_course_id from public.course_lessons where id = p_lesson_id;
  if v_course_id is null then
    raise exception 'lesson not found';
  end if;
  if not exists (select 1 from public.enrollments where profile_id = auth.uid() and course_id = v_course_id) then
    raise exception 'not enrolled';
  end if;

  insert into public.lesson_completions (profile_id, lesson_id)
  values (auth.uid(), p_lesson_id)
  on conflict do nothing;

  select count(*) into v_total from public.course_lessons where course_id = v_course_id;
  select count(*) into v_done
  from public.lesson_completions lc
  join public.course_lessons cl on cl.id = lc.lesson_id
  where lc.profile_id = auth.uid() and cl.course_id = v_course_id;

  v_progress := round(100.0 * v_done / greatest(v_total, 1));

  update public.enrollments set progress = v_progress
  where profile_id = auth.uid() and course_id = v_course_id;

  return v_progress;
end;
$$;
