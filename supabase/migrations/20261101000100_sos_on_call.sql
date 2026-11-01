-- An on-call rota for SOS alerts.
--
-- Until now an SOS told every admin and moderator at once and nobody in
-- particular was expected to answer it, so an alert at 3 a.m. could sit
-- unseen. Now:
--
-- * admins keep a rota of shifts, with one primary and at most one backup
--   on call at any moment;
-- * an SOS is assigned to the primary on call and pushed to them first; the
--   rest of the SOS staff are told who is on call;
-- * whoever takes it presses "I'm on it", which tells the person in danger
--   that someone has seen it and is calling;
-- * an SOS nobody has taken after 3 minutes goes again to the primary, the
--   backup and every admin; after 10 minutes, and every 10 minutes after
--   that, to every member of staff who can handle it;
-- * SOS pushes ignore muted notification kinds;
-- * each morning admins are told of any time in the next two days with
--   nobody on call.
--
-- The 3- and 10-minute steps are first proposals, like the other policy
-- numbers.

-- ---------------------------------------------------------------------------
-- 1. Who can be on call, and the rota
-- ---------------------------------------------------------------------------

-- Mirrors public.staff_can('users') for any account, not just the caller:
-- admins and moderators handle SOS alerts.
create function private.sos_staff(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = p_id
    and deleted_at is null and suspended_at is null and staff_role in ('admin', 'moderator'));
$$;
revoke all on function private.sos_staff(uuid) from public, anon, authenticated;

create table public.sos_shifts (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete cascade,
  duty text not null check (duty in ('primary', 'backup')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at and ends_at - starts_at <= interval '7 days')
);
create index sos_shifts_when on public.sos_shifts(ends_at, starts_at);
alter table public.sos_shifts enable row level security;
revoke all on public.sos_shifts from anon, authenticated;
grant select on public.sos_shifts to authenticated;
create policy "SOS staff read the rota" on public.sos_shifts for select to authenticated
  using (public.staff_can('users'));

-- The person on call for a duty at a moment, if they can still take SOS
-- alerts (a shift outlives a role that is taken away).
create function private.sos_on_call(p_duty text, p_at timestamptz default now())
returns uuid language sql stable security definer set search_path = public as $$
  select s.staff_id from public.sos_shifts s
  where s.duty = p_duty and s.starts_at <= p_at and s.ends_at > p_at and private.sos_staff(s.staff_id)
  order by s.starts_at desc limit 1;
$$;
revoke all on function private.sos_on_call(text, timestamptz) from public, anon, authenticated;

-- The stretches of a period with no primary on call.
create function private.sos_gaps(p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select lower(g), upper(g) from unnest(
    tstzmultirange(tstzrange(p_from, p_to)) - coalesce(
      (select range_agg(tstzrange(s.starts_at, s.ends_at)) from public.sos_shifts s
       where s.duty = 'primary' and s.starts_at < p_to and s.ends_at > p_from and private.sos_staff(s.staff_id)),
      '{}'::tstzmultirange)) g
  order by 1;
$$;
revoke all on function private.sos_gaps(timestamptz, timestamptz) from public, anon, authenticated;

create function public.sos_rota_gaps(p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.staff_can('users') then raise exception 'admins only'; end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '31 days' then
    raise exception 'choose a period of up to 31 days';
  end if;
  return query select * from private.sos_gaps(p_from, p_to);
end;
$$;

-- The staff who can be put on the rota.
create function public.admin_sos_staff()
returns table (id uuid, full_name text, staff_role text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.staff_can('users') then raise exception 'admins only'; end if;
  return query select p.id, p.full_name, p.staff_role::text from public.profiles p
    where private.sos_staff(p.id) order by p.full_name;
end;
$$;

create function private.lagos_time(p timestamptz)
returns text language sql stable as $$
  select to_char(p at time zone 'Africa/Lagos', 'Dy DD Mon HH24:MI');
$$;
revoke all on function private.lagos_time(timestamptz) from public, anon, authenticated;

create function public.admin_save_sos_shift(p_staff_id uuid, p_duty text, p_starts_at timestamptz, p_ends_at timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  if p_duty is null or p_duty not in ('primary', 'backup') then raise exception 'choose primary or backup'; end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then raise exception 'a shift must end after it starts'; end if;
  if p_ends_at - p_starts_at > interval '7 days' then raise exception 'a shift can be at most 7 days'; end if;
  if p_ends_at <= now() then raise exception 'that shift is already over'; end if;
  if not private.sos_staff(p_staff_id) then raise exception 'only an admin or moderator can be on call'; end if;
  -- One rota change at a time, so two admins cannot fill the same slot at once.
  perform pg_advisory_xact_lock(hashtext('public.sos_shifts'));
  if exists(select 1 from public.sos_shifts where duty = p_duty and starts_at < p_ends_at and ends_at > p_starts_at) then
    raise exception 'another % shift overlaps that time', p_duty;
  end if;
  if exists(select 1 from public.sos_shifts where staff_id = p_staff_id and starts_at < p_ends_at and ends_at > p_starts_at) then
    raise exception 'they are already on call during that time';
  end if;
  insert into public.sos_shifts(staff_id, duty, starts_at, ends_at, created_by)
  values (p_staff_id, p_duty, p_starts_at, p_ends_at, auth.uid()) returning id into v_id;
  insert into public.admin_actions(actor_id, action, target_id, detail)
  values (auth.uid(), 'sos_shift_added', p_staff_id, jsonb_build_object('shift', v_id, 'duty', p_duty, 'starts_at', p_starts_at, 'ends_at', p_ends_at));
  if p_staff_id <> auth.uid() then
    perform public.notify(p_staff_id, 'system', 'You are on SOS call (' || p_duty || ')',
      private.lagos_time(p_starts_at) || ' to ' || private.lagos_time(p_ends_at) || ', Lagos time. Keep push on and your phone with you.',
      'admin_sos_rota', v_id::text);
  end if;
  return v_id;
end;
$$;

-- A shift that has not started is removed; one under way ends now, so the
-- record of who was on call stays; one that is over cannot be changed.
create function public.admin_remove_sos_shift(p_shift_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s public.sos_shifts;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  perform pg_advisory_xact_lock(hashtext('public.sos_shifts'));
  select * into s from public.sos_shifts where id = p_shift_id for update;
  if s.id is null then raise exception 'shift not found'; end if;
  if s.ends_at <= now() then raise exception 'that shift is already over'; end if;
  if s.starts_at > now() then
    delete from public.sos_shifts where id = s.id;
  else
    update public.sos_shifts set ends_at = now() where id = s.id;
  end if;
  insert into public.admin_actions(actor_id, action, target_id, detail)
  values (auth.uid(), 'sos_shift_removed', s.staff_id, jsonb_build_object('shift', s.id, 'duty', s.duty, 'starts_at', s.starts_at, 'ends_at', s.ends_at));
  if s.staff_id <> auth.uid() then
    perform public.notify(s.staff_id, 'system', 'An SOS shift was taken off the rota',
      initcap(s.duty) || ', ' || private.lagos_time(s.starts_at) || ' to ' || private.lagos_time(s.ends_at) || ', Lagos time.',
      'admin_sos_rota', s.id::text);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Assigning, taking and escalating an SOS
-- ---------------------------------------------------------------------------

alter table public.sos_alerts
  add column assigned_to uuid references public.profiles(id),
  add column acknowledged_by uuid references public.profiles(id),
  add column acknowledged_at timestamptz,
  add column escalation_level smallint not null default 0,
  add column escalated_at timestamptz;

create function private.sos_title(p_name text)
returns text language sql immutable as $$
  select coalesce(nullif(trim(p_name), ''), 'Someone') || ' needs help';
$$;
revoke all on function private.sos_title(text) from public, anon, authenticated;

create or replace function public.raise_sos(p_meetup_id uuid, p_lat double precision, p_lng double precision, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_name text; m public.meetups; v_primary uuid; v_primary_name text; v_body text;
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
  v_primary := private.sos_on_call('primary');
  -- Staff can be in danger too: nobody answers their own SOS.
  if v_primary = auth.uid() then v_primary := private.sos_on_call('backup'); end if;
  select full_name into v_primary_name from public.profiles where id = v_primary;
  insert into public.sos_alerts(profile_id, meetup_id, lat, lng, note, assigned_to, escalation_level, escalated_at)
  values (auth.uid(), p_meetup_id, round(p_lat::numeric, 5), round(p_lng::numeric, 5), nullif(trim(p_note), ''), v_primary,
    -- With nobody on call everyone is told at once, as at the last escalation step.
    case when v_primary is null then 2 else 0 end, case when v_primary is null then now() end)
  returning id into v_id;
  insert into public.security_events(profile_id, kind, detail) values (auth.uid(), 'sos', jsonb_build_object('alert', v_id, 'meetup', p_meetup_id));
  v_body := coalesce(m.title || ' · ' || m.place, 'No meet-up attached') || coalesce(' · ' || nullif(trim(p_note), ''), '');
  if v_primary is not null then
    perform public.notify(v_primary, 'system', 'SOS, you are on call: ' || private.sos_title(v_name),
      'Open it and press "I''m on it", then call them. ' || v_body, 'admin_sos', v_id::text);
  end if;
  insert into public.notifications(profile_id, kind, title, body, ref_type, ref_id)
  select p.id, 'system', 'SOS: ' || private.sos_title(v_name),
    case when v_primary is null then 'Nobody is on call. Whoever sees this first, take it. '
      else 'On call: ' || coalesce(nullif(v_primary_name, ''), 'a member of staff') || '. ' end || v_body,
    'admin_sos', v_id::text
  from public.profiles p
  where p.deleted_at is null and p.suspended_at is null and p.staff_role in ('admin', 'moderator')
    and p.id is distinct from v_primary and p.id <> auth.uid();
  return v_id;
end;
$$;

-- "I'm on it": one person takes the alert, and the person in danger is told
-- that someone has seen it.
create function public.admin_take_sos(p_alert_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a public.sos_alerts;
begin
  if not public.staff_can('users') then raise exception 'admins only'; end if;
  if exists(select 1 from public.sos_alerts where id = p_alert_id and profile_id = auth.uid()) then
    raise exception 'someone else must answer your own SOS';
  end if;
  update public.sos_alerts set acknowledged_by = auth.uid(), acknowledged_at = now()
  where id = p_alert_id and status = 'open' and acknowledged_at is null returning * into a;
  if a.id is null then
    if exists(select 1 from public.sos_alerts where id = p_alert_id and status = 'open') then
      raise exception 'someone has already taken this SOS';
    end if;
    raise exception 'alert already reviewed';
  end if;
  insert into public.admin_actions(actor_id, action, target_id, detail)
  values (auth.uid(), 'take_sos', a.profile_id, jsonb_build_object('alert', a.id, 'minutes', round(extract(epoch from now() - a.created_at) / 60)));
  perform public.notify(a.profile_id, 'system', 'FindWork has seen your SOS',
    'Someone from our team is calling you now on the number on your account. If you are in immediate danger, call 112 (767 in Lagos).',
    'support', null);
end;
$$;

-- As before, and closing an alert nobody took first counts as taking it.
create or replace function public.admin_handle_sos(p_alert_id uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare a public.sos_alerts;
begin
  if not public.staff_can('users') then raise exception 'admins only'; end if;
  if char_length(trim(coalesce(p_note, ''))) < 3 then raise exception 'say what was done'; end if;
  if exists(select 1 from public.sos_alerts where id = p_alert_id and profile_id = auth.uid()) then
    raise exception 'someone else must answer your own SOS';
  end if;
  update public.sos_alerts set status = 'handled', handled_by = auth.uid(), handled_at = now(), handled_note = trim(p_note),
    acknowledged_by = coalesce(acknowledged_by, auth.uid()), acknowledged_at = coalesce(acknowledged_at, now())
  where id = p_alert_id and status = 'open' returning * into a;
  if a.id is null then raise exception 'alert already reviewed'; end if;
  insert into public.admin_actions(actor_id, action, target_id, detail) values (auth.uid(), 'handle_sos', a.profile_id, jsonb_build_object('note', trim(p_note)));
  perform public.notify(a.profile_id, 'system', 'FindWork has responded to your SOS', trim(p_note), 'support', null);
end;
$$;

-- Run every minute. Returns how many alerts it escalated.
create function private.escalate_sos()
returns integer language plpgsql security definer set search_path = public as $$
declare a record; v_count integer := 0; v_minutes integer; v_backup uuid;
begin
  for a in
    select s.id, s.profile_id, s.assigned_to, s.escalation_level, s.created_at, p.full_name
    from public.sos_alerts s join public.profiles p on p.id = s.profile_id
    where s.status = 'open' and s.acknowledged_at is null and (
      (s.escalation_level = 0 and s.created_at <= now() - interval '3 minutes')
      or (s.escalation_level = 1 and s.created_at <= now() - interval '10 minutes')
      or (s.escalation_level >= 2 and s.escalated_at <= now() - interval '10 minutes'))
    order by s.created_at
    for update of s skip locked
  loop
    v_minutes := floor(extract(epoch from now() - a.created_at) / 60);
    if a.escalation_level = 0 then
      v_backup := private.sos_on_call('backup');
      insert into public.notifications(profile_id, kind, title, body, ref_type, ref_id)
      select p.id, 'system', 'SOS not taken after ' || v_minutes || ' minutes: ' || private.sos_title(a.full_name),
        'Nobody has pressed "I''m on it". If you can, take it now.', 'admin_sos', a.id::text
      from public.profiles p
      where p.deleted_at is null and p.suspended_at is null
        and (p.id = a.assigned_to or p.id = v_backup or p.staff_role = 'admin') and private.sos_staff(p.id)
        and p.id <> a.profile_id;
    else
      insert into public.notifications(profile_id, kind, title, body, ref_type, ref_id)
      select p.id, 'system', 'SOS still not taken after ' || v_minutes || ' minutes: ' || private.sos_title(a.full_name),
        'Whoever sees this first, take it now.', 'admin_sos', a.id::text
      from public.profiles p
      where p.deleted_at is null and p.suspended_at is null and p.staff_role in ('admin', 'moderator')
        and p.id <> a.profile_id;
    end if;
    update public.sos_alerts set escalation_level = escalation_level + 1, escalated_at = now() where id = a.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function private.escalate_sos() from public, anon, authenticated;

-- Each morning: any time in the next two days with nobody on call.
create function private.remind_sos_rota_gaps()
returns void language plpgsql security definer set search_path = public as $$
declare v_gaps text;
begin
  select string_agg(private.lagos_time(g.starts_at) || ' to ' || private.lagos_time(g.ends_at), '; ' order by g.starts_at)
  into v_gaps from private.sos_gaps(now(), now() + interval '48 hours') g;
  if v_gaps is null then return; end if;
  insert into public.notifications(profile_id, kind, title, body, ref_type, ref_id)
  select p.id, 'system', 'The SOS rota has gaps',
    'Nobody is on call ' || v_gaps || ' (Lagos time). Add shifts under Operations, SOS on-call rota.', 'admin_sos_rota', null
  from public.profiles p
  where p.deleted_at is null and p.suspended_at is null and p.staff_role = 'admin';
end;
$$;
revoke all on function private.remind_sos_rota_gaps() from public, anon, authenticated;

-- The open alerts, with what staff need to act at once: the person's phone,
-- who they were meeting, and who is on it.
create function public.admin_sos_queue()
returns table (
  id uuid, profile_id uuid, full_name text, phone text, lat numeric, lng numeric, note text, created_at timestamptz,
  meetup_id uuid, meetup_title text, meetup_place text, meet_at timestamptz, other_id uuid, other_name text,
  assigned_to uuid, assigned_name text, acknowledged_by uuid, acknowledged_name text, acknowledged_at timestamptz,
  escalation_level smallint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.staff_can('users') then raise exception 'admins only'; end if;
  return query
    select s.id, s.profile_id, p.full_name, nullif(p.phone, ''), s.lat, s.lng, s.note, s.created_at,
      m.id, m.title, m.place, m.meet_at, o.id, o.full_name,
      s.assigned_to, asg.full_name, s.acknowledged_by, ack.full_name, s.acknowledged_at, s.escalation_level
    from public.sos_alerts s
    join public.profiles p on p.id = s.profile_id
    left join public.meetups m on m.id = s.meetup_id
    left join public.profiles o on o.id = case when m.buyer_id = s.profile_id then m.seller_id else m.buyer_id end
    left join public.profiles asg on asg.id = s.assigned_to
    left join public.profiles ack on ack.id = s.acknowledged_by
    where s.status = 'open'
    order by s.created_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. SOS pushes ignore muted kinds
-- ---------------------------------------------------------------------------

-- As in 20261021000100_native_push, except that an SOS is pushed to staff
-- even when they have muted system notifications.
create or replace function private.request_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_url text; v_secret text;
begin
  if not exists(select 1 from public.push_subscriptions where profile_id = new.profile_id)
     and not exists(select 1 from public.push_devices where profile_id = new.profile_id) then
    return new;
  end if;
  if new.ref_type is distinct from 'admin_sos'
     and exists(select 1 from public.user_preferences where profile_id = new.profile_id and new.kind = any(muted_kinds)) then
    return new;
  end if;
  select value into v_url from private.settings where key = 'push_url';
  select value into v_secret from private.settings where key = 'push_secret';
  if v_url is null or v_secret is null then return new; end if;
  -- A push that cannot be requested must never stop the notification itself.
  begin
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
      body := jsonb_build_object('notification_id', new.id));
  exception when others then
    raise warning 'push request failed: %', sqlerrm;
  end;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Grants and schedules
-- ---------------------------------------------------------------------------

revoke all on function public.sos_rota_gaps(timestamptz, timestamptz) from public, anon;
revoke all on function public.admin_sos_staff() from public, anon;
revoke all on function public.admin_save_sos_shift(uuid, text, timestamptz, timestamptz) from public, anon;
revoke all on function public.admin_remove_sos_shift(uuid) from public, anon;
revoke all on function public.admin_take_sos(uuid) from public, anon;
revoke all on function public.admin_sos_queue() from public, anon;
grant execute on function public.sos_rota_gaps(timestamptz, timestamptz) to authenticated;
grant execute on function public.admin_sos_staff() to authenticated;
grant execute on function public.admin_save_sos_shift(uuid, text, timestamptz, timestamptz) to authenticated;
grant execute on function public.admin_remove_sos_shift(uuid) to authenticated;
grant execute on function public.admin_take_sos(uuid) to authenticated;
grant execute on function public.admin_sos_queue() to authenticated;

-- Hosted pg_cron availability must be verified at deployment. Without it,
-- nothing escalates: run private.escalate_sos() every minute another way.
do $$
begin
  if exists(select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('escalate-sos', '* * * * *', 'select private.escalate_sos()');
    perform cron.schedule('remind-sos-rota-gaps', '0 7 * * *', 'select private.remind_sos_rota_gaps()');
    raise notice 'pg_cron: SOS escalation every minute, rota-gap reminder daily at 07:00 UTC';
  else
    raise notice 'pg_cron not installed; run private.escalate_sos() every minute and private.remind_sos_rota_gaps() daily another way';
  end if;
exception when others then
  raise notice 'pg_cron not scheduled (%): run private.escalate_sos() every minute another way', sqlerrm;
end;
$$;
