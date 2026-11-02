-- Fair use of live video, so that no one seller can use up the minutes the
-- whole platform shares.
--
-- LiveKit counts a minute for every person in a video room for every minute
-- they are in it, the seller included. Its free plan has a monthly pool
-- (5,000 at the time of writing) and cuts video off for everyone once that is
-- spent. So:
--
-- * every minute the livekit-meter function asks LiveKit which rooms are open
--   and how many people are in each, and records it here (live_video_tick);
-- * a seller has a monthly allowance (750 minutes to start with); a stream
--   runs for at most 60 minutes once live, after a camera check of at most 15,
--   and takes at most 50 viewers at once;
-- * new camera streams pause when the platform has used 90% of its pool, and
--   every FindWork video stream stops at 98%, so LiveKit never has to;
-- * sellers are warned five minutes before a stream's time is up and at 90% of
--   their allowance; admins when the platform reaches 90%.
--
-- The numbers are first proposals; admins change them in the console
-- (admin_set_live_video_policy). The pooled link option (YouTube and the
-- like) is never limited: it costs FindWork nothing.

-- ---------------------------------------------------------------------------
-- 1. Policy and the cycle it is counted over
-- ---------------------------------------------------------------------------

create function private.live_video_policy()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'plan_minutes', coalesce((select value::integer from private.settings where key = 'live_video_plan_minutes'), 5000),
    'seller_minutes', coalesce((select value::integer from private.settings where key = 'live_video_seller_minutes'), 750),
    'stream_minutes', coalesce((select value::integer from private.settings where key = 'live_video_stream_minutes'), 60),
    'preview_minutes', coalesce((select value::integer from private.settings where key = 'live_video_preview_minutes'), 15),
    'max_viewers', coalesce((select value::integer from private.settings where key = 'live_video_max_viewers'), 50),
    -- The day of the month LiveKit's billing cycle starts (its dashboard says).
    'cycle_day', coalesce((select value::integer from private.settings where key = 'live_video_cycle_day'), 1));
$$;
revoke all on function private.live_video_policy() from public, anon, authenticated;

-- The start of the current cycle: the most recent cycle day, midnight UTC.
create function private.live_video_cycle_start(p_day integer, p_now timestamptz default now())
returns timestamptz language sql stable set search_path = public as $$
  select (date_trunc('month', p_now at time zone 'utc')
    - case when extract(day from p_now at time zone 'utc') >= p_day then interval '0' else interval '1 month' end
    + make_interval(days => p_day - 1)) at time zone 'utc';
$$;
revoke all on function private.live_video_cycle_start(integer, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. What was used
-- ---------------------------------------------------------------------------

create table public.live_video_minutes (
  stream_id uuid not null references public.live_streams(id) on delete cascade,
  seller_id uuid not null references public.provider_profiles(id) on delete cascade,
  minute timestamptz not null,
  participants integer not null check (participants between 1 and 100000),
  -- false while the seller was checking the camera before going live.
  live boolean not null,
  primary key (stream_id, minute)
);
create index live_video_minutes_when on public.live_video_minutes(minute);
create index live_video_minutes_seller on public.live_video_minutes(seller_id, minute);
alter table public.live_video_minutes enable row level security;
revoke all on public.live_video_minutes from anon, authenticated;

alter table public.live_streams
  -- Why FindWork ended it, when it did: null means the seller ended it.
  add column ended_reason text check (ended_reason in ('time_limit', 'allowance', 'budget')),
  -- Warnings already sent for this stream, so each is sent once.
  add column video_warned text[] not null default '{}',
  -- When someone was last let into the video room; the meter runs only near it.
  add column video_joined_at timestamptz;

-- Minutes used this cycle, by the platform or by one seller.
create function private.live_video_used(p_seller_id uuid default null)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(sum(participants), 0)::integer from public.live_video_minutes
  where minute >= private.live_video_cycle_start((private.live_video_policy()->>'cycle_day')::integer)
    and (p_seller_id is null or seller_id = p_seller_id);
$$;
revoke all on function private.live_video_used(uuid) from public, anon, authenticated;

-- Where the platform stands: 'open', 'paused' (no new camera streams) or
-- 'stopped' (every FindWork video stream ends).
create function private.live_video_state(p_used integer, p_policy jsonb)
returns text language sql immutable set search_path = public as $$
  select case
    when p_used >= floor((p_policy->>'plan_minutes')::numeric * 0.98) then 'stopped'
    when p_used >= floor((p_policy->>'plan_minutes')::numeric * 0.90) then 'paused'
    else 'open' end;
$$;
revoke all on function private.live_video_state(integer, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Who may join the video, now with the limits
-- ---------------------------------------------------------------------------

-- Service role only, from livekit-token. Null when this person may not join
-- at all; { denied: reason } when a limit stops them; otherwise the room and
-- whether they may broadcast. Granting stamps video_joined_at.
drop function public.stream_access(uuid, uuid);
create function public.stream_access(p_stream_id uuid, p_profile_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.live_streams;
  v_policy jsonb := private.live_video_policy();
  v_state text;
  v_name text;
begin
  select * into s from public.live_streams where id = p_stream_id;
  if s.id is null or s.video <> 'livekit' then return null; end if;
  v_state := private.live_video_state(private.live_video_used(), v_policy);

  if s.seller_id = p_profile_id then
    if s.status not in ('scheduled', 'live') or public.is_suspended(p_profile_id) then return null; end if;
    if v_state = 'stopped' or (v_state = 'paused' and s.status = 'scheduled') then return jsonb_build_object('denied', 'budget'); end if;
    if private.live_video_used(s.seller_id) >= (v_policy->>'seller_minutes')::integer then return jsonb_build_object('denied', 'allowance'); end if;
    if s.status = 'scheduled' and (select count(*) from public.live_video_minutes m where m.stream_id = s.id and not m.live)
        >= (v_policy->>'preview_minutes')::integer then
      return jsonb_build_object('denied', 'preview');
    end if;
    if s.status = 'live' and s.started_at <= now() - make_interval(mins => (v_policy->>'stream_minutes')::integer) then
      return jsonb_build_object('denied', 'time');
    end if;
    select business_name into v_name from public.provider_profiles where id = s.seller_id;
    update public.live_streams set video_joined_at = now() where id = s.id;
    return jsonb_build_object('room', 'stream-' || s.id, 'publish', true, 'status', s.status, 'name', v_name);
  end if;

  if s.status <> 'live' or public.is_suspended(s.seller_id)
     or not exists(select 1 from public.profiles p where p.id = p_profile_id and p.deleted_at is null) then
    return null;
  end if;
  if v_state = 'stopped' then return jsonb_build_object('denied', 'budget'); end if;
  if (select count(*) from public.stream_viewers v where v.stream_id = s.id and v.profile_id <> p_profile_id
        and v.last_seen_at > now() - interval '45 seconds') >= (v_policy->>'max_viewers')::integer then
    return jsonb_build_object('denied', 'full');
  end if;
  select split_part(full_name, ' ', 1) into v_name from public.profiles where id = p_profile_id;
  update public.live_streams set video_joined_at = now() where id = s.id;
  return jsonb_build_object('room', 'stream-' || s.id, 'publish', false, 'status', s.status, 'name', v_name);
end;
$$;
revoke all on function public.stream_access(uuid, uuid) from public, anon, authenticated;
grant execute on function public.stream_access(uuid, uuid) to service_role;

-- As before, except that a FindWork video stream cannot go live (and tell
-- every follower) when there is no video left to carry it.
create or replace function public.update_stream(p_stream_id uuid, p_action text, p_product_id text)
returns void language plpgsql security definer set search_path = public as $$
declare s public.live_streams; v_name text; v_policy jsonb;
begin
  select * into s from public.live_streams where id = p_stream_id for update;
  if s.id is null or s.seller_id <> auth.uid() then raise exception 'stream not found'; end if;
  if p_action = 'start' then
    if s.status <> 'scheduled' then raise exception 'stream cannot be changed'; end if;
    if s.video = 'livekit' then
      v_policy := private.live_video_policy();
      if private.live_video_state(private.live_video_used(), v_policy) <> 'open' then raise exception 'live video used up'; end if;
      if private.live_video_used(s.seller_id) >= (v_policy->>'seller_minutes')::integer then raise exception 'live video allowance used'; end if;
    end if;
    update public.live_streams set status = 'live', started_at = now() where id = p_stream_id;
    select business_name into v_name from public.provider_profiles where id = s.seller_id;
    -- Everyone who saved this seller hears that they are live.
    insert into public.notifications(profile_id, kind, title, body, ref_type, ref_id)
    select f.profile_id, 'system', coalesce(v_name, 'A seller you follow') || ' is live', s.title, 'stream', s.id::text
    from public.favourites f join public.profiles p on p.id = f.profile_id
    where f.provider_id = s.seller_id and p.deleted_at is null;
  elsif p_action = 'end' then
    if s.status = 'ended' then return; end if;
    update public.live_streams set status = 'ended', ended_at = now(), pinned_product_id = null where id = p_stream_id;
    delete from public.stream_viewers where stream_id = p_stream_id;
  elsif p_action = 'pin' then
    if s.status <> 'live' then raise exception 'stream cannot be changed'; end if;
    if p_product_id is not null and not exists(select 1 from public.stream_products where stream_id = p_stream_id and product_id = p_product_id) then
      raise exception 'product not found';
    end if;
    update public.live_streams set pinned_product_id = p_product_id where id = p_stream_id;
  else
    raise exception 'invalid action';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. The meter: every minute, record and enforce
-- ---------------------------------------------------------------------------

create function private.end_stream_for(p_stream_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare s public.live_streams;
begin
  update public.live_streams set status = 'ended', ended_at = now(), pinned_product_id = null, ended_reason = p_reason
  where id = p_stream_id and status <> 'ended' returning * into s;
  if s.id is null then return; end if;
  delete from public.stream_viewers where stream_id = p_stream_id;
  perform public.notify(s.seller_id, 'system',
    case p_reason
      when 'time_limit' then 'Your live stream reached its time limit'
      when 'allowance' then 'Your live video for this month is used up'
      else 'Live video is paused for everyone this month' end,
    case p_reason
      when 'time_limit' then 'FindWork ended "' || s.title || '". You can start another while you have minutes left this month.'
      when 'allowance' then 'FindWork ended "' || s.title || '". Stream with a YouTube link until your minutes reset.'
      else 'FindWork ended "' || s.title || '" because the free video minutes are nearly gone. Stream with a YouTube link until they reset.' end,
    'stream', s.id::text);
end;
$$;
revoke all on function private.end_stream_for(uuid, text) from public, anon, authenticated;

-- Service role only, from livekit-meter, with LiveKit's list of open rooms:
-- [{ room, participants }]. Returns { close: [rooms to delete], state, used }.
-- Safe to run twice in a minute: a minute is recorded once per stream.
create function public.live_video_tick(p_rooms jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_policy jsonb := private.live_video_policy();
  v_minute timestamptz := date_trunc('minute', now());
  v_cycle timestamptz := private.live_video_cycle_start((v_policy->>'cycle_day')::integer);
  v_close text[] := '{}';
  v_open text[] := '{}';
  v_used integer;
  v_state text;
  v_reason text;
  r record;
  s public.live_streams;
begin
  -- 1. Record this minute for every FindWork room LiveKit has open.
  for r in
    select e->>'room' as room, greatest(0, coalesce((e->>'participants')::integer, 0)) as participants
    from jsonb_array_elements(coalesce(p_rooms, '[]'::jsonb)) e
  loop
    -- Rooms that are not a stream's are not FindWork's to touch.
    if r.room is null or r.room !~ '^stream-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then continue; end if;
    v_open := v_open || r.room;
    select * into s from public.live_streams where id = substr(r.room, 8)::uuid;
    if s.id is null or s.video <> 'livekit' or s.status = 'ended' then
      v_close := v_close || r.room;
    end if;
    if s.id is not null and r.participants > 0 then
      insert into public.live_video_minutes(stream_id, seller_id, minute, participants, live)
      values (s.id, s.seller_id, v_minute, r.participants, s.status = 'live')
      on conflict (stream_id, minute) do nothing;
    end if;
  end loop;

  v_used := private.live_video_used();
  v_state := private.live_video_state(v_used, v_policy);

  -- 2. Enforce on every FindWork video stream that is open.
  for s in select * from public.live_streams where video = 'livekit' and status in ('scheduled', 'live') order by created_at for update
  loop
    v_reason := null;
    if s.status = 'live' then
      if v_state = 'stopped' then v_reason := 'budget';
      elsif s.started_at <= now() - make_interval(mins => (v_policy->>'stream_minutes')::integer) then v_reason := 'time_limit';
      elsif private.live_video_used(s.seller_id) >= (v_policy->>'seller_minutes')::integer then v_reason := 'allowance';
      end if;
      if v_reason is not null then
        perform private.end_stream_for(s.id, v_reason);
        v_close := v_close || ('stream-' || s.id);
        continue;
      end if;
      if s.started_at <= now() - make_interval(mins => (v_policy->>'stream_minutes')::integer - 5) and not 'time' = any(s.video_warned) then
        perform public.notify(s.seller_id, 'system', '5 minutes left on your live stream',
          'Live streams on FindWork video run for up to ' || (v_policy->>'stream_minutes') || ' minutes. Wrap up your sale.', 'stream', s.id::text);
        update public.live_streams set video_warned = video_warned || 'time'::text where id = s.id;
      end if;
      if private.live_video_used(s.seller_id) >= floor((v_policy->>'seller_minutes')::numeric * 0.9) and not 'allowance' = any(s.video_warned) then
        perform public.notify(s.seller_id, 'system', 'Your live video for this month is nearly used up',
          'When it runs out, this stream ends. Viewers count too: 10 people for 3 minutes uses 30 minutes.', 'stream', s.id::text);
        update public.live_streams set video_warned = video_warned || 'allowance'::text where id = s.id;
      end if;
    elsif ('stream-' || s.id) = any(v_open) then
      -- A camera check: closed when there is no video to give, or after its time.
      if v_state <> 'open'
         or private.live_video_used(s.seller_id) >= (v_policy->>'seller_minutes')::integer
         or (select count(*) from public.live_video_minutes m where m.stream_id = s.id and not m.live) >= (v_policy->>'preview_minutes')::integer then
        v_close := v_close || ('stream-' || s.id);
      end if;
    end if;
  end loop;

  -- 3. Tell the admins, once a cycle, that new camera streams are paused.
  if v_state <> 'open' and coalesce((select value from private.settings where key = 'live_video_warned_cycle'), '') <> v_cycle::text then
    insert into private.settings(key, value) values ('live_video_warned_cycle', v_cycle::text)
    on conflict (key) do update set value = excluded.value;
    insert into public.notifications(profile_id, kind, title, body, ref_type, ref_id)
    select p.id, 'system', 'Live video is 90% used this month',
      v_used || ' of ' || (v_policy->>'plan_minutes') || ' minutes are used. New camera streams are paused until the cycle resets; sellers can still stream with a link.',
      'admin_live_video', null
    from public.profiles p where p.deleted_at is null and p.suspended_at is null and p.staff_role = 'admin';
  end if;

  return jsonb_build_object('close', to_jsonb(array(select distinct unnest(v_close))), 'state', v_state, 'used', v_used);
end;
$$;
revoke all on function public.live_video_tick(jsonb) from public, anon, authenticated;
grant execute on function public.live_video_tick(jsonb) to service_role;

-- Every minute, while a FindWork video room could be open: a stream live, a
-- camera check in the last half hour, or one that ended in the last ten
-- minutes (to close a room left behind). Needs the two settings rows that
-- npm run secrets:push writes with LIVEKIT_HOOK_SECRET.
create function private.request_live_video_tick()
returns void language plpgsql security definer set search_path = public as $$
declare v_url text; v_secret text;
begin
  select value into v_url from private.settings where key = 'livekit_tick_url';
  select value into v_secret from private.settings where key = 'livekit_hook_secret';
  if v_url is null or v_secret is null then return; end if;
  if not exists(select 1 from public.live_streams where video = 'livekit' and (
      status = 'live'
      or (status = 'scheduled' and video_joined_at > now() - interval '30 minutes')
      or (status = 'ended' and ended_at > now() - interval '10 minutes'))) then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-livekit-hook-secret', v_secret),
    body := '{}'::jsonb);
exception when others then
  raise warning 'live video meter request failed: %', sqlerrm;
end;
$$;
revoke all on function private.request_live_video_tick() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. What sellers and staff see, and how admins change the numbers
-- ---------------------------------------------------------------------------

-- The signed-in seller's live video this cycle.
create function public.live_video_allowance()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_policy jsonb := private.live_video_policy(); v_day integer;
begin
  if not exists(select 1 from public.provider_profiles where id = auth.uid()) then raise exception 'provider not found'; end if;
  v_day := (v_policy->>'cycle_day')::integer;
  return jsonb_build_object(
    'used', private.live_video_used(auth.uid()),
    'allowance', (v_policy->>'seller_minutes')::integer,
    'state', private.live_video_state(private.live_video_used(), v_policy),
    'stream_minutes', (v_policy->>'stream_minutes')::integer,
    'preview_minutes', (v_policy->>'preview_minutes')::integer,
    'max_viewers', (v_policy->>'max_viewers')::integer,
    'resets_at', private.live_video_cycle_start(v_day) + interval '1 month');
end;
$$;

-- Staff: the cycle so far, who used it, and the numbers in force.
create function public.admin_live_video()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_policy jsonb := private.live_video_policy(); v_cycle timestamptz; v_used integer;
begin
  if not public.staff_can('analytics') then raise exception 'admins only'; end if;
  v_cycle := private.live_video_cycle_start((v_policy->>'cycle_day')::integer);
  v_used := private.live_video_used();
  return jsonb_build_object(
    'policy', v_policy,
    'used', v_used,
    'state', private.live_video_state(v_used, v_policy),
    'cycle_start', v_cycle,
    'resets_at', v_cycle + interval '1 month',
    'sellers', coalesce((
      select jsonb_agg(jsonb_build_object('seller_id', t.seller_id, 'name', pp.business_name, 'minutes', t.minutes) order by t.minutes desc)
      from (select seller_id, sum(participants)::integer as minutes from public.live_video_minutes
            where minute >= v_cycle group by seller_id order by 2 desc limit 10) t
      left join public.provider_profiles pp on pp.id = t.seller_id), '[]'::jsonb));
end;
$$;

create function public.admin_set_live_video_policy(p_plan_minutes integer, p_seller_minutes integer, p_stream_minutes integer,
  p_preview_minutes integer, p_max_viewers integer, p_cycle_day integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  if p_plan_minutes is null or p_plan_minutes not between 100 and 100000000
     or p_seller_minutes is null or p_seller_minutes not between 0 and p_plan_minutes
     or p_stream_minutes is null or p_stream_minutes not between 10 and 600
     or p_preview_minutes is null or p_preview_minutes not between 0 and 60
     or p_max_viewers is null or p_max_viewers not between 1 and 10000
     or p_cycle_day is null or p_cycle_day not between 1 and 28 then
    raise exception 'invalid live video policy';
  end if;
  insert into private.settings(key, value) values
    ('live_video_plan_minutes', p_plan_minutes::text), ('live_video_seller_minutes', p_seller_minutes::text),
    ('live_video_stream_minutes', p_stream_minutes::text), ('live_video_preview_minutes', p_preview_minutes::text),
    ('live_video_max_viewers', p_max_viewers::text), ('live_video_cycle_day', p_cycle_day::text)
  on conflict (key) do update set value = excluded.value;
  insert into public.admin_actions(actor_id, action, target_id, detail)
  values (auth.uid(), 'set_live_video_policy', null, jsonb_build_object(
    'plan_minutes', p_plan_minutes, 'seller_minutes', p_seller_minutes, 'stream_minutes', p_stream_minutes,
    'preview_minutes', p_preview_minutes, 'max_viewers', p_max_viewers, 'cycle_day', p_cycle_day));
end;
$$;

revoke all on function public.live_video_allowance() from public, anon;
revoke all on function public.admin_live_video() from public, anon;
revoke all on function public.admin_set_live_video_policy(integer, integer, integer, integer, integer, integer) from public, anon;
grant execute on function public.live_video_allowance() to authenticated;
grant execute on function public.admin_live_video() to authenticated;
grant execute on function public.admin_set_live_video_policy(integer, integer, integer, integer, integer, integer) to authenticated;

-- Hosted pg_cron availability must be verified at deployment.
do $$
begin
  if exists(select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('meter-live-video', '* * * * *', 'select private.request_live_video_tick()');
    raise notice 'pg_cron: live video meter every minute';
  else
    raise notice 'pg_cron not installed; run private.request_live_video_tick() every minute another way';
  end if;
exception when others then
  raise notice 'pg_cron not scheduled (%): run private.request_live_video_tick() every minute another way', sqlerrm;
end;
$$;
