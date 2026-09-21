-- Product catalog: seed/admin-managed, no client write policies at all —
-- only the service role (seed script, future admin panel) can write.
create table public.products (
  id text primary key,
  name text not null,
  price integer not null,
  vendor text not null,
  variant text,
  image_url text,
  created_at timestamptz not null default now()
);

alter table public.products enable row level security;

create policy "Products are viewable by authenticated users"
  on public.products for select
  to authenticated
  using (true);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles (id),
  total integer not null,
  delivery_speed text not null check (delivery_speed in ('same-day', 'standard')),
  status text not null default 'placed' check (status in ('placed', 'delivered', 'returned')),
  placed_at timestamptz not null default now()
);

alter table public.orders enable row level security;

create policy "Customers see their own orders"
  on public.orders for select
  to authenticated
  using (customer_id = auth.uid());

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id text not null references public.products (id),
  -- Name/price are a snapshot at purchase time, independent of later catalog changes.
  name text not null,
  price integer not null,
  qty integer not null check (qty > 0)
);

alter table public.order_items enable row level security;

create policy "Customers see their own order items"
  on public.order_items for select
  to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id and o.customer_id = auth.uid()
    )
  );
