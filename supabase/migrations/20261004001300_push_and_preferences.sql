-- PRD Live Communication: push notifications. PRD Role-Based Onboarding:
-- user preference setup.
--
-- Every in-app notification can also be pushed to the devices its owner has
-- turned push on for. The database only asks for the push; the send-push
-- Edge Function holds the keys and does the sending.

create table public.user_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  language text not null default 'en' check (language in ('en', 'pcm', 'yo', 'ig', 'ha')),
  -- Notification kinds this person does not want pushed. They still arrive in the inbox.
  muted_kinds text[] not null default '{}',
  -- What they came for; used to order what Home suggests.
  interests text[] not null default '{}' check (cardinality(interests) <= 20),
  updated_at timestamptz not null default now()
);
alter table public.user_preferences enable row level security;
revoke all on public.user_preferences from anon, authenticated;
grant select on public.user_preferences to authenticated;
create policy "Owner reads preferences" on public.user_preferences for select to authenticated using (profile_id = auth.uid());

create function public.save_preferences(p_language text, p_muted_kinds text[], p_interests text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.profiles where id = auth.uid() and deleted_at is null;
  if not found then raise exception 'not authenticated'; end if;
  if p_language is null or p_language not in ('en', 'pcm', 'yo', 'ig', 'ha') then raise exception 'invalid language'; end if;
  if cardinality(coalesce(p_interests, '{}')) > 20 or cardinality(coalesce(p_muted_kinds, '{}')) > 20 then raise exception 'too many choices'; end if;
  insert into public.user_preferences(profile_id, language, muted_kinds, interests)
  values (auth.uid(), p_language, coalesce(p_muted_kinds, '{}'), coalesce(p_interests, '{}'))
  on conflict (profile_id) do update
    set language = excluded.language, muted_kinds = excluded.muted_kinds, interests = excluded.interests, updated_at = now();
end;
$$;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) between 20 and 200),
  auth_key text not null check (char_length(auth_key) between 8 and 100),
  label text not null default '' check (char_length(label) <= 200),
  created_at timestamptz not null default now(),
  last_sent_at timestamptz
);
create index push_subscriptions_owner on public.push_subscriptions(profile_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
-- The keys are for the sender only.
grant select (id, profile_id, endpoint, label, created_at, last_sent_at) on public.push_subscriptions to authenticated;
create policy "Owner reads push subscriptions" on public.push_subscriptions for select to authenticated using (profile_id = auth.uid());

-- A browser has one subscription. If someone else signs in on the same
-- device, it becomes theirs: the last person must not keep getting pushes there.
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_label text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.profiles where id = auth.uid() and deleted_at is null;
  if not found then raise exception 'not authenticated'; end if;
  if coalesce(p_endpoint, '') !~ '^https://' then raise exception 'invalid push subscription'; end if;
  insert into public.push_subscriptions(profile_id, endpoint, p256dh, auth_key, label)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(coalesce(p_label, ''), 200))
  on conflict (endpoint) do update
    set profile_id = excluded.profile_id, p256dh = excluded.p256dh, auth_key = excluded.auth_key, label = excluded.label;
end;
$$;

create function public.remove_push_subscription(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and profile_id = auth.uid();
$$;

revoke all on function public.save_preferences(text, text[], text[]) from public, anon;
revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
revoke all on function public.remove_push_subscription(text) from public, anon;
grant execute on function public.save_preferences(text, text[], text[]) to authenticated;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.remove_push_subscription(text) to authenticated;

-- Where to ask for a push, and the shared secret the function checks. Set
-- once per project, by hand, after deploying send-push:
--   insert into private.settings values
--     ('push_url', 'https://<project-ref>.supabase.co/functions/v1/send-push'),
--     ('push_secret', '<the PUSH_HOOK_SECRET function secret>');
create table private.settings (key text primary key, value text not null);
revoke all on private.settings from public, anon, authenticated;

create function private.request_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_url text; v_secret text;
begin
  if not exists(select 1 from public.push_subscriptions where profile_id = new.profile_id) then return new; end if;
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
create trigger notifications_request_push after insert on public.notifications
  for each row execute function private.request_push();

-- Service role only: what send-push needs to deliver one notification.
create function public.push_targets(p_notification_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'notification', jsonb_build_object('id', n.id, 'kind', n.kind, 'title', n.title, 'body', n.body, 'created_at', n.created_at, 'read_at', n.read_at),
    'subscriptions', coalesce((select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth_key))
      from public.push_subscriptions s where s.profile_id = n.profile_id), '[]'::jsonb))
  from public.notifications n where n.id = p_notification_id;
$$;

-- Service role only: a browser that has unsubscribed answers "gone"; forget it.
create function public.push_delivered(p_endpoints text[], p_gone text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.push_subscriptions set last_sent_at = now() where endpoint = any(coalesce(p_endpoints, '{}'));
  delete from public.push_subscriptions where endpoint = any(coalesce(p_gone, '{}'));
end;
$$;
revoke all on function public.push_targets(uuid) from public, anon, authenticated;
revoke all on function public.push_delivered(text[], text[]) from public, anon, authenticated;
grant execute on function public.push_targets(uuid) to service_role;
grant execute on function public.push_delivered(text[], text[]) to service_role;
