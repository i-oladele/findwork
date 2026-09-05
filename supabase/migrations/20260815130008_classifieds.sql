create table public.classifieds (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles (id),
  title text not null,
  price integer not null,
  category text not null check (category in ('Rentals', 'Used goods')),
  location text not null,
  description text not null,
  created_at timestamptz not null default now()
);

alter table public.classifieds enable row level security;

create policy "Classifieds are browsable by authenticated users"
  on public.classifieds for select
  to authenticated
  using (true);

create policy "A seller can post a classified"
  on public.classifieds for insert
  to authenticated
  with check (seller_id = auth.uid());

create policy "A seller can edit or remove their own classified"
  on public.classifieds for update
  to authenticated
  using (seller_id = auth.uid())
  with check (seller_id = auth.uid());

create policy "A seller can delete their own classified"
  on public.classifieds for delete
  to authenticated
  using (seller_id = auth.uid());
