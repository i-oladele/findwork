-- Three things the app promised but could not do:
--
--   1. "Near me" — providers had a free-text location, so nothing could be
--      sorted or filtered by distance. Areas are now a fixed list with
--      coordinates, which avoids paying a geocoding service and keeps the
--      data clean enough to rank on.
--   2. Saving a provider — the heart in the prototype did nothing.
--   3. Showing work — the portfolio storage bucket existed with no column
--      to record what had been uploaded.

-- ---------------------------------------------------------------------------
-- 1. Service areas
-- ---------------------------------------------------------------------------

-- Coordinates are the approximate centre of each area: good enough to rank
-- "who is closest", not a substitute for a real address. Add rows as the app
-- moves beyond Lagos; nothing in the code hardcodes this list except the
-- picker's ordering.
create table public.service_areas (
  name text primary key,
  city text not null default 'Lagos',
  lat numeric(8, 5) not null,
  lng numeric(8, 5) not null
);

alter table public.service_areas enable row level security;

create policy "Service areas are readable by everyone signed in"
  on public.service_areas for select to authenticated using (true);

insert into public.service_areas (name, lat, lng) values
  ('Yaba', 6.50950, 3.37110),
  ('Ebute Metta', 6.48500, 3.38000),
  ('Surulere', 6.50000, 3.35000),
  ('Mushin', 6.53330, 3.35000),
  ('Oshodi', 6.55500, 3.34000),
  ('Isolo', 6.53500, 3.32000),
  ('Ikeja', 6.60180, 3.35150),
  ('Ogba', 6.62700, 3.34200),
  ('Agege', 6.61520, 3.32160),
  ('Magodo', 6.62000, 3.37000),
  ('Maryland', 6.57190, 3.36700),
  ('Gbagada', 6.55400, 3.38800),
  ('Ojota', 6.58330, 3.38330),
  ('Ketu', 6.59500, 3.38300),
  ('Ikorodu', 6.61940, 3.51050),
  ('Egbeda', 6.59000, 3.29000),
  ('Ikotun', 6.54500, 3.26600),
  ('Festac', 6.46500, 3.28700),
  ('Apapa', 6.44830, 3.35920),
  ('Ikoyi', 6.45500, 3.43500),
  ('Victoria Island', 6.42810, 3.42190),
  ('Lekki', 6.44780, 3.47230),
  ('Ajah', 6.46980, 3.58520);

-- Every table that carries an area also carries its coordinates, copied here
-- rather than joined, so ranking by distance never needs a join.
create function private.apply_area_coordinates()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.area is null then
    new.lat := null;
    new.lng := null;
  else
    select lat, lng into new.lat, new.lng from public.service_areas where name = new.area;
  end if;
  return new;
end;
$$;

alter table public.provider_profiles
  add column area text references public.service_areas (name),
  add column lat numeric(8, 5),
  add column lng numeric(8, 5);

alter table public.profiles
  add column area text references public.service_areas (name),
  add column lat numeric(8, 5),
  add column lng numeric(8, 5);

create trigger provider_profiles_area_coordinates
  before insert or update of area on public.provider_profiles
  for each row execute procedure private.apply_area_coordinates();

create trigger profiles_area_coordinates
  before insert or update of area on public.profiles
  for each row execute procedure private.apply_area_coordinates();

-- Clients may set their own area; the coordinates are derived, never sent.
grant update (area) on public.profiles to authenticated;
grant update (area) on public.provider_profiles to authenticated;
grant insert (area) on public.provider_profiles to authenticated;

create index provider_profiles_area_idx on public.provider_profiles (area);

-- Existing rows: match the free-text location to an area where it is exact.
update public.provider_profiles p
set area = a.name
from public.service_areas a
where p.area is null and lower(trim(p.location)) = lower(a.name);

update public.profiles p
set area = a.name
from public.service_areas a
where p.area is null and p.location is not null
  and lower(split_part(p.location, ',', 1)) = lower(a.name);

-- ---------------------------------------------------------------------------
-- 2. Saved providers
-- ---------------------------------------------------------------------------

create table public.favourites (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  provider_id uuid not null references public.provider_profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, provider_id)
);

alter table public.favourites enable row level security;

create policy "Users see their own saved providers"
  on public.favourites for select to authenticated using (profile_id = auth.uid());

create policy "Users save providers for themselves"
  on public.favourites for insert to authenticated with check (profile_id = auth.uid());

create policy "Users remove their own saved providers"
  on public.favourites for delete to authenticated using (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. Portfolio photos
-- ---------------------------------------------------------------------------

-- Public URLs from the provider-portfolios bucket, in display order.
alter table public.provider_profiles
  add column photo_urls text[] not null default '{}',
  add constraint provider_profiles_photo_limit check (array_length(photo_urls, 1) is null or array_length(photo_urls, 1) <= 8);

grant update (photo_urls) on public.provider_profiles to authenticated;
