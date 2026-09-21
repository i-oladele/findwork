-- Any profile can become a provider by inserting a provider_profiles row
-- linked to their own id — this is the real "switch to selling" flow.
create table public.provider_profiles (
  id uuid primary key references public.profiles (id) on delete cascade,
  business_name text not null,
  category text not null,
  location text not null,
  bio text,
  price integer not null default 0,
  price_unit text not null default 'job',
  verified boolean not null default false,
  rating numeric(2, 1) not null default 0,
  reviews integer not null default 0,
  jobs_done integer not null default 0,
  trust_score integer not null default 0,
  taking_bookings boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.provider_profiles enable row level security;

create policy "Provider profiles are viewable by authenticated users"
  on public.provider_profiles for select
  to authenticated
  using (true);

create policy "A user can create their own provider profile"
  on public.provider_profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "A provider can update their own provider profile"
  on public.provider_profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create table public.provider_packages (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles (id) on delete cascade,
  name text not null,
  price integer not null,
  detail text,
  status text not null default 'live' check (status in ('live', 'paused')),
  created_at timestamptz not null default now()
);

alter table public.provider_packages enable row level security;

create policy "Provider packages are viewable by authenticated users"
  on public.provider_packages for select
  to authenticated
  using (true);

create policy "A provider manages their own packages"
  on public.provider_packages for all
  to authenticated
  using (
    exists (
      select 1 from public.provider_profiles pp
      where pp.id = provider_packages.provider_id and pp.id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.provider_profiles pp
      where pp.id = provider_packages.provider_id and pp.id = auth.uid()
    )
  );

create table public.provider_availability (
  provider_id uuid primary key references public.provider_profiles (id) on delete cascade,
  monday boolean not null default true,
  tuesday boolean not null default true,
  wednesday boolean not null default true,
  thursday boolean not null default true,
  friday boolean not null default true,
  saturday boolean not null default true,
  sunday boolean not null default false
);

alter table public.provider_availability enable row level security;

create policy "Availability is viewable by authenticated users"
  on public.provider_availability for select
  to authenticated
  using (true);

create policy "A provider manages their own availability"
  on public.provider_availability for all
  to authenticated
  using (provider_id = auth.uid())
  with check (provider_id = auth.uid());
