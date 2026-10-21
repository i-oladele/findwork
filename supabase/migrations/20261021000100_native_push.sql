-- PRD Live Communication: push to the iPhone and Android apps.
--
-- Web push does not reach an app. The apps register with Firebase Cloud
-- Messaging instead (Android directly, the iPhone through FCM's bridge to
-- Apple's push service) and keep their token here, beside the browsers in
-- push_subscriptions. send-push delivers to both.

create table public.push_devices (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  token text not null unique check (char_length(token) between 20 and 4096 and token !~ '\s'),
  label text not null default '' check (char_length(label) <= 200),
  created_at timestamptz not null default now(),
  -- Last time the app handed this token over; the oldest go first past the cap below.
  saved_at timestamptz not null default now(),
  last_sent_at timestamptz
);
create index push_devices_owner on public.push_devices(profile_id, saved_at desc);
alter table public.push_devices enable row level security;
revoke all on public.push_devices from anon, authenticated;
grant select (id, profile_id, platform, token, label, created_at, saved_at, last_sent_at) on public.push_devices to authenticated;
create policy "Owner reads push devices" on public.push_devices for select to authenticated using (profile_id = auth.uid());

-- A phone has one token. Whoever signs in on it gets its pushes: the last
-- person must not keep getting them there. Each person keeps at most ten
-- devices, so made-up tokens cannot make every notification fan out.
create function public.save_push_device(p_token text, p_platform text, p_label text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.profiles where id = auth.uid() and deleted_at is null;
  if not found then raise exception 'not authenticated'; end if;
  if p_platform is null or p_platform not in ('ios', 'android')
     or coalesce(char_length(p_token), 0) not between 20 and 4096 or p_token ~ '\s' then
    raise exception 'invalid push device';
  end if;
  insert into public.push_devices(profile_id, platform, token, label, saved_at)
  values (auth.uid(), p_platform, p_token, left(coalesce(p_label, ''), 200), clock_timestamp())
  on conflict (token) do update
    set profile_id = excluded.profile_id, platform = excluded.platform, label = excluded.label, saved_at = excluded.saved_at;
  delete from public.push_devices
  where profile_id = auth.uid()
    and id not in (select id from public.push_devices where profile_id = auth.uid() order by saved_at desc limit 10);
end;
$$;

create function public.remove_push_device(p_token text)
returns void language sql security definer set search_path = public as $$
  delete from public.push_devices where token = p_token and profile_id = auth.uid();
$$;

-- Account deletion anonymises the profile rather than deleting it. Forget its
-- phones in that same transaction, and its browsers, which nothing removed
-- until now.
create function private.erase_push_addresses()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.push_devices where profile_id = new.id;
  delete from public.push_subscriptions where profile_id = new.id;
  return new;
end;
$$;
create trigger profiles_erase_push_addresses after update of deleted_at on public.profiles
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function private.erase_push_addresses();

revoke all on function public.save_push_device(text, text, text) from public, anon;
revoke all on function public.remove_push_device(text) from public, anon;
grant execute on function public.save_push_device(text, text, text) to authenticated;
grant execute on function public.remove_push_device(text) to authenticated;

-- As before, but a person with only the app on their phone is pushed too.
create or replace function private.request_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_url text; v_secret text;
begin
  if not exists(select 1 from public.push_subscriptions where profile_id = new.profile_id)
     and not exists(select 1 from public.push_devices where profile_id = new.profile_id) then
    return new;
  end if;
  if exists(select 1 from public.user_preferences where profile_id = new.profile_id and new.kind = any(muted_kinds)) then return new; end if;
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

-- Service role only: the browsers and now the apps to deliver one notification to.
create or replace function public.push_targets(p_notification_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'notification', jsonb_build_object('id', n.id, 'kind', n.kind, 'title', n.title, 'body', n.body, 'created_at', n.created_at, 'read_at', n.read_at),
    'subscriptions', coalesce((select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth_key))
      from public.push_subscriptions s where s.profile_id = n.profile_id), '[]'::jsonb),
    'devices', coalesce((select jsonb_agg(jsonb_build_object('token', d.token, 'platform', d.platform))
      from public.push_devices d where d.profile_id = n.profile_id), '[]'::jsonb))
  from public.notifications n where n.id = p_notification_id;
$$;

-- Service role only: FCM answers "unregistered" for an app that was
-- uninstalled or whose token was replaced; forget it.
create function public.push_devices_delivered(p_tokens text[], p_gone text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.push_devices set last_sent_at = now() where token = any(coalesce(p_tokens, '{}'));
  delete from public.push_devices where token = any(coalesce(p_gone, '{}'));
end;
$$;
revoke all on function public.push_devices_delivered(text[], text[]) from public, anon, authenticated;
grant execute on function public.push_devices_delivered(text[], text[]) to service_role;
