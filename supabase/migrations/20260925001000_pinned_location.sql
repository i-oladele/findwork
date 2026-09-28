-- Where someone is: a pin, not only an area from a list.
--
-- "Add your area" on Home now lets a person use their phone's location or
-- search for their street, and pins it on a map. The pin is kept exactly,
-- with the address it was found at, and the nearest area from the fixed list
-- is filled in for them, so filters and "nearest first" keep working.
--
-- A pin is where someone lives, so it is private: lat, lng and
-- location_label are not in the column grants other users read from
-- (they see full_name, location and the avatar). Only set_my_location
-- writes them.

alter table public.profiles
  add column location_label text check (location_label is null or char_length(location_label) <= 200);

-- Straight-line distance in km between two points (haversine).
create function private.km_between(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
as $$
  select 2 * 6371 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- Choosing an area from the list moves the point to the area's centre, and
-- a pin set earlier no longer applies. A pin being saved keeps its own
-- point; so does any update that leaves the area as it was (editing your
-- name in Settings sends the area too).
create function private.apply_profile_location()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if current_setting('findwork.pinning', true) = 'on' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.area is not distinct from old.area then
    return new;
  end if;
  if new.area is null then
    new.lat := null;
    new.lng := null;
  else
    select lat, lng into new.lat, new.lng from public.service_areas where name = new.area;
  end if;
  new.location_label := null;
  return new;
end;
$$;

drop trigger profiles_area_coordinates on public.profiles;
create trigger profiles_area_coordinates
  before insert or update of area on public.profiles
  for each row execute procedure private.apply_profile_location();

-- Saves the caller's pin. Returns the nearest listed area, or null when the
-- pin is not near any of them (the list covers Lagos for now).
create function public.set_my_location(p_lat double precision, p_lng double precision, p_label text)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_area text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180
     or coalesce(trim(p_label), '') = '' or char_length(trim(p_label)) > 200 then
    raise exception 'invalid location';
  end if;

  -- Areas are a few km apart; beyond 8 km of every centre, none fits.
  select name into v_area
  from public.service_areas
  where private.km_between(lat, lng, p_lat, p_lng) <= 8
  order by private.km_between(lat, lng, p_lat, p_lng)
  limit 1;

  perform set_config('findwork.pinning', 'on', true);
  update public.profiles
  set lat = round(p_lat::numeric, 5),
      lng = round(p_lng::numeric, 5),
      area = v_area,
      location_label = trim(p_label)
  where id = auth.uid();
  perform set_config('findwork.pinning', 'off', true);

  return v_area;
end;
$$;

revoke execute on function public.set_my_location(double precision, double precision, text) from public, anon;
grant execute on function public.set_my_location(double precision, double precision, text) to authenticated;
