-- PRD Local Marketplace Listings: nearby listings and location search.
-- PRD Meet-Up Safety Tools: arranged meet-ups, consented and expiring
-- location sharing, SOS alerts and trusted contacts.

-- ---------------------------------------------------------------------------
-- 1. Where a listing is
-- ---------------------------------------------------------------------------

-- A listing is placed in a listed area and takes that area's centre as its
-- position. Never the seller's own pin: that is where they live.
alter table public.classifieds
  add column area text references public.service_areas(name),
  add column lat numeric(8, 5),
  add column lng numeric(8, 5);

create function private.place_classified()
returns trigger language plpgsql security definer set search_path = public as $$
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
create trigger classifieds_place before insert or update on public.classifieds
  for each row execute function private.place_classified();

-- Existing listings whose free-text location names a listed area.
update public.classifieds c set area = a.name
from public.service_areas a where c.area is null and position(lower(a.name) in lower(c.location)) > 0;
create index classifieds_area on public.classifieds(area);

-- Listings within a radius of a point, nearest first.
create function public.nearby_classifieds(p_lat double precision, p_lng double precision, p_radius_km integer, p_category text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180
     or p_radius_km is null or p_radius_km not between 1 and 200 then
    raise exception 'invalid location';
  end if;
  return coalesce((
    select jsonb_agg(row order by (row->>'km')::numeric, row->>'created_at' desc)
    from (
      select jsonb_build_object(
        'id', c.id, 'seller_id', c.seller_id, 'title', c.title, 'price', c.price, 'category', c.category,
        'location', c.location, 'area', c.area, 'lat', c.lat, 'lng', c.lng, 'photo_urls', c.photo_urls, 'created_at', c.created_at,
        'km', round(private.km_between(p_lat, p_lng, c.lat, c.lng)::numeric, 1),
        'seller_tier', p.verification_tier, 'seller_trust', p.trust_score) as row
      from public.classifieds c join public.profiles p on p.id = c.seller_id
      where c.lat is not null and p.deleted_at is null and p.suspended_at is null
        and (p_category is null or c.category = p_category)
        and private.km_between(p_lat, p_lng, c.lat, c.lng) <= p_radius_km
      order by private.km_between(p_lat, p_lng, c.lat, c.lng) limit 100
    ) rows), '[]'::jsonb);
end;
$$;
revoke all on function public.nearby_classifieds(double precision, double precision, integer, text) from public, anon;
grant execute on function public.nearby_classifieds(double precision, double precision, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Meet-ups
-- ---------------------------------------------------------------------------

create table public.meetups (
  id uuid primary key default gen_random_uuid(),
  classified_id uuid references public.classifieds(id) on delete set null,
  title text not null,
  buyer_id uuid not null references public.profiles(id),
  seller_id uuid not null references public.profiles(id),
  place text not null check (char_length(trim(place)) between 3 and 200),
  meet_at timestamptz not null,
  status text not null default 'proposed' check (status in ('proposed', 'confirmed', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  check (buyer_id <> seller_id)
);
create index meetups_buyer on public.meetups(buyer_id, meet_at desc);
create index meetups_seller on public.meetups(seller_id, meet_at desc);
alter table public.meetups enable row level security;
revoke all on public.meetups from anon, authenticated;
grant select on public.meetups to authenticated;
create policy "The two people meeting and user staff read a meet-up" on public.meetups for select to authenticated
  using (auth.uid() in (buyer_id, seller_id) or public.staff_can('users'));

create function public.propose_meetup(p_classified_id uuid, p_place text, p_meet_at timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_ad public.classifieds; v_id uuid;
begin
  perform 1 from public.profiles where id = auth.uid() and deleted_at is null and suspended_at is null;
  if not found then raise exception 'not authenticated'; end if;
  select * into v_ad from public.classifieds where id = p_classified_id;
  if v_ad.id is null then raise exception 'listing not found'; end if;
  if v_ad.seller_id = auth.uid() then raise exception 'cannot meet yourself'; end if;
  if public.is_suspended(v_ad.seller_id) then raise exception 'counterparty_suspended'; end if;
  if char_length(trim(coalesce(p_place, ''))) not between 3 and 200 then raise exception 'meeting place required'; end if;
  if p_meet_at is null or p_meet_at < now() or p_meet_at > now() + interval '60 days' then raise exception 'invalid meeting time'; end if;
  if (select count(*) from public.meetups where buyer_id = auth.uid() and status in ('proposed', 'confirmed')) >= 10 then
    raise exception 'too many open meet-ups';
  end if;
  insert into public.meetups(classified_id, title, buyer_id, seller_id, place, meet_at)
  values (v_ad.id, v_ad.title, auth.uid(), v_ad.seller_id, trim(p_place), p_meet_at) returning id into v_id;
  perform public.notify(v_ad.seller_id, 'system', 'Someone wants to meet about your listing',
    v_ad.title || ' · ' || trim(p_place), 'meetup', v_id::text);
  return v_id;
end;
$$;

-- confirm (the seller), complete or cancel (either).
create function public.update_meetup(p_meetup_id uuid, p_action text)
returns void language plpgsql security definer set search_path = public as $$
declare m public.meetups; v_other uuid;
begin
  select * into m from public.meetups where id = p_meetup_id for update;
  if m.id is null or auth.uid() not in (m.buyer_id, m.seller_id) then raise exception 'meet-up not found'; end if;
  v_other := case when auth.uid() = m.buyer_id then m.seller_id else m.buyer_id end;
  if p_action = 'confirm' then
    if auth.uid() <> m.seller_id or m.status <> 'proposed' then raise exception 'meet-up cannot be changed'; end if;
    update public.meetups set status = 'confirmed' where id = p_meetup_id;
    perform public.notify(v_other, 'system', 'Your meet-up is confirmed', m.title || ' · ' || m.place, 'meetup', m.id::text);
  elsif p_action = 'complete' then
    if m.status <> 'confirmed' then raise exception 'meet-up cannot be changed'; end if;
    update public.meetups set status = 'completed' where id = p_meetup_id;
  elsif p_action = 'cancel' then
    if m.status not in ('proposed', 'confirmed') then raise exception 'meet-up cannot be changed'; end if;
    update public.meetups set status = 'cancelled' where id = p_meetup_id;
    perform public.notify(v_other, 'system', 'A meet-up was cancelled', m.title, 'meetup', m.id::text);
  else
    raise exception 'invalid action';
  end if;
  -- A finished meet-up shares nobody's location.
  if p_action in ('complete', 'cancel') then
    update public.location_shares set expires_at = least(expires_at, now()) where meetup_id = p_meetup_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Location sharing, by consent and for a set time
-- ---------------------------------------------------------------------------

create table public.location_shares (
  id uuid primary key default gen_random_uuid(),
  meetup_id uuid not null references public.meetups(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  lat numeric(8, 5),
  lng numeric(8, 5),
  located_at timestamptz,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (meetup_id, owner_id)
);
alter table public.location_shares enable row level security;
revoke all on public.location_shares from anon, authenticated;
-- Read only through meetup_locations, which checks who is asking and whether
-- the share is still running.

create function public.start_location_share(p_meetup_id uuid, p_minutes integer)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare m public.meetups; v_expires timestamptz;
begin
  select * into m from public.meetups where id = p_meetup_id;
  if m.id is null or auth.uid() not in (m.buyer_id, m.seller_id) then raise exception 'meet-up not found'; end if;
  if m.status not in ('proposed', 'confirmed') then raise exception 'meet-up cannot be changed'; end if;
  if p_minutes is null or p_minutes not between 5 and 180 then raise exception 'invalid duration'; end if;
  v_expires := now() + make_interval(mins => p_minutes);
  insert into public.location_shares(meetup_id, owner_id, expires_at) values (p_meetup_id, auth.uid(), v_expires)
  on conflict (meetup_id, owner_id) do update set expires_at = excluded.expires_at, started_at = now();
  return v_expires;
end;
$$;

create function public.update_location_share(p_meetup_id uuid, p_lat double precision, p_lng double precision)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'invalid location';
  end if;
  update public.location_shares set lat = round(p_lat::numeric, 5), lng = round(p_lng::numeric, 5), located_at = now()
  where meetup_id = p_meetup_id and owner_id = auth.uid() and expires_at > now();
  if not found then raise exception 'location sharing has ended'; end if;
end;
$$;

create function public.stop_location_share(p_meetup_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.location_shares set expires_at = now(), lat = null, lng = null, located_at = null
  where meetup_id = p_meetup_id and owner_id = auth.uid();
$$;

-- What each of the two people may see: whether they are sharing themselves,
-- and the other person's position only while that person's share is running.
create function public.meetup_locations(p_meetup_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare m public.meetups; v_other uuid;
begin
  select * into m from public.meetups where id = p_meetup_id;
  if m.id is null or not (auth.uid() in (m.buyer_id, m.seller_id) or public.staff_can('users')) then raise exception 'meet-up not found'; end if;
  v_other := case when auth.uid() = m.buyer_id then m.seller_id else m.buyer_id end;
  return jsonb_build_object(
    'mine', (select jsonb_build_object('expires_at', s.expires_at, 'located_at', s.located_at)
      from public.location_shares s where s.meetup_id = p_meetup_id and s.owner_id = auth.uid() and s.expires_at > now()),
    'theirs', (select jsonb_build_object('lat', s.lat, 'lng', s.lng, 'located_at', s.located_at, 'expires_at', s.expires_at)
      from public.location_shares s where s.meetup_id = p_meetup_id and s.owner_id = v_other and s.expires_at > now() and s.lat is not null));
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Trusted contacts and SOS
-- ---------------------------------------------------------------------------

create table public.trusted_contacts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  phone text not null check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  created_at timestamptz not null default now(),
  unique (profile_id, phone)
);
alter table public.trusted_contacts enable row level security;
revoke all on public.trusted_contacts from anon, authenticated;
grant select on public.trusted_contacts to authenticated;
create policy "Owner reads trusted contacts" on public.trusted_contacts for select to authenticated using (profile_id = auth.uid());

create function public.save_trusted_contact(p_name text, p_phone text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform 1 from public.profiles where id = auth.uid() and deleted_at is null for update;
  if not found then raise exception 'not authenticated'; end if;
  if (select count(*) from public.trusted_contacts where profile_id = auth.uid()) >= 3 then raise exception 'You can save up to 3 trusted contacts.'; end if;
  insert into public.trusted_contacts(profile_id, name, phone) values (auth.uid(), trim(p_name), trim(p_phone)) returning id into v_id;
  return v_id;
end;
$$;

create function public.remove_trusted_contact(p_contact_id uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.trusted_contacts where id = p_contact_id and profile_id = auth.uid();
$$;

create table public.sos_alerts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  meetup_id uuid references public.meetups(id) on delete set null,
  lat numeric(8, 5),
  lng numeric(8, 5),
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'open' check (status in ('open', 'handled')),
  handled_by uuid references public.profiles(id),
  handled_at timestamptz,
  handled_note text,
  created_at timestamptz not null default now()
);
create index sos_alerts_queue on public.sos_alerts(status, created_at desc);
alter table public.sos_alerts enable row level security;
revoke all on public.sos_alerts from anon, authenticated;
grant select on public.sos_alerts to authenticated;
create policy "Owner and user staff read SOS alerts" on public.sos_alerts for select to authenticated
  using (profile_id = auth.uid() or public.staff_can('users'));

-- Tells the FindWork team at once, with the last known position and who the
-- person was meeting. It does not call the police: the app says so, and
-- offers the emergency numbers beside the button.
create function public.raise_sos(p_meetup_id uuid, p_lat double precision, p_lng double precision, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_name text; m public.meetups;
begin
  select full_name into v_name from public.profiles where id = auth.uid() and deleted_at is null;
  if not found then raise exception 'not authenticated'; end if;
  if p_meetup_id is not null then
    select * into m from public.meetups where id = p_meetup_id;
    if m.id is null or auth.uid() not in (m.buyer_id, m.seller_id) then raise exception 'meet-up not found'; end if;
  end if;
  -- One open alert at a time: pressing again updates it rather than flooding the queue.
  select id into v_id from public.sos_alerts where profile_id = auth.uid() and status = 'open' order by created_at desc limit 1;
  if v_id is not null then
    update public.sos_alerts set lat = coalesce(round(p_lat::numeric, 5), lat), lng = coalesce(round(p_lng::numeric, 5), lng),
      note = coalesce(nullif(trim(p_note), ''), note), meetup_id = coalesce(p_meetup_id, meetup_id) where id = v_id;
    return v_id;
  end if;
  insert into public.sos_alerts(profile_id, meetup_id, lat, lng, note)
  values (auth.uid(), p_meetup_id, round(p_lat::numeric, 5), round(p_lng::numeric, 5), nullif(trim(p_note), '')) returning id into v_id;
  insert into public.security_events(profile_id, kind, detail) values (auth.uid(), 'sos', jsonb_build_object('alert', v_id, 'meetup', p_meetup_id));
  perform private.notify_staff('users', 'system', 'SOS: ' || coalesce(nullif(v_name, ''), 'a user') || ' needs help',
    coalesce(m.title || ' · ' || m.place, 'No meet-up attached') || coalesce(' · ' || nullif(trim(p_note), ''), ''), 'admin_sos', v_id::text);
  return v_id;
end;
$$;

create function public.admin_handle_sos(p_alert_id uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare a public.sos_alerts;
begin
  if not public.staff_can('users') then raise exception 'admins only'; end if;
  if char_length(trim(coalesce(p_note, ''))) < 3 then raise exception 'say what was done'; end if;
  update public.sos_alerts set status = 'handled', handled_by = auth.uid(), handled_at = now(), handled_note = trim(p_note)
  where id = p_alert_id and status = 'open' returning * into a;
  if a.id is null then raise exception 'alert already reviewed'; end if;
  insert into public.admin_actions(actor_id, action, target_id, detail) values (auth.uid(), 'handle_sos', a.profile_id, jsonb_build_object('note', trim(p_note)));
  perform public.notify(a.profile_id, 'system', 'FindWork has responded to your SOS', trim(p_note), 'support', null);
end;
$$;

revoke all on function public.propose_meetup(uuid, text, timestamptz) from public, anon;
revoke all on function public.update_meetup(uuid, text) from public, anon;
revoke all on function public.start_location_share(uuid, integer) from public, anon;
revoke all on function public.update_location_share(uuid, double precision, double precision) from public, anon;
revoke all on function public.stop_location_share(uuid) from public, anon;
revoke all on function public.meetup_locations(uuid) from public, anon;
revoke all on function public.save_trusted_contact(text, text) from public, anon;
revoke all on function public.remove_trusted_contact(uuid) from public, anon;
revoke all on function public.raise_sos(uuid, double precision, double precision, text) from public, anon;
revoke all on function public.admin_handle_sos(uuid, text) from public, anon;
grant execute on function public.propose_meetup(uuid, text, timestamptz) to authenticated;
grant execute on function public.update_meetup(uuid, text) to authenticated;
grant execute on function public.start_location_share(uuid, integer) to authenticated;
grant execute on function public.update_location_share(uuid, double precision, double precision) to authenticated;
grant execute on function public.stop_location_share(uuid) to authenticated;
grant execute on function public.meetup_locations(uuid) to authenticated;
grant execute on function public.save_trusted_contact(text, text) to authenticated;
grant execute on function public.remove_trusted_contact(uuid) to authenticated;
grant execute on function public.raise_sos(uuid, double precision, double precision, text) to authenticated;
grant execute on function public.admin_handle_sos(uuid, text) to authenticated;

-- SOS must work for a suspended account too: add it to the API hook's
-- always-allowed list.
create or replace function public.check_request()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_method text := coalesce(current_setting('request.method', true), '');
  v_path text := coalesce(current_setting('request.path', true), '');
begin
  if auth.uid() is null then return; end if;
  if v_path = '/rpc/raise_sos' then return; end if;
  if private.session_aal() <> 'aal2' and private.has_verified_factor(auth.uid()) then
    raise exception 'mfa_required';
  end if;
  if v_method in ('GET', 'HEAD', 'OPTIONS') then return; end if;
  if v_path in ('/rpc/get_my_profile', '/rpc/wallet_summary', '/rpc/is_admin', '/rpc/staff_can', '/rpc/chat_inbox',
      '/rpc/mark_notification_read', '/rpc/record_sign_in', '/support_requests') then
    return;
  end if;
  if exists(select 1 from public.profiles where id = auth.uid() and suspended_at is not null) then
    raise exception 'account_suspended';
  end if;
end;
$$;
