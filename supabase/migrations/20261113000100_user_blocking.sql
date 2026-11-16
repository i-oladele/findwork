-- Blocking preserves transaction/dispute history but stops new direct messages
-- in both directions, including attachment RPCs, and hides social content.
create table public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index user_blocks_reverse on public.user_blocks(blocked_id, blocker_id);
alter table public.user_blocks enable row level security;
revoke all on public.user_blocks from anon, authenticated;
grant select, insert, delete on public.user_blocks to authenticated;
create policy "People read their own blocks" on public.user_blocks for select to authenticated
  using (blocker_id = auth.uid());
create policy "People block as themselves" on public.user_blocks for insert to authenticated
  with check (blocker_id = auth.uid());
create policy "People remove their own blocks" on public.user_blocks for delete to authenticated
  using (blocker_id = auth.uid());

-- Callers may only inspect their own relationship; nobody can enumerate
-- blocks between other people. Return a boolean, never the other party's list.
create function public.users_blocked(p_first uuid, p_second uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case when auth.uid() in (p_first, p_second) then exists (
    select 1 from public.user_blocks
    where (blocker_id = p_first and blocked_id = p_second)
       or (blocker_id = p_second and blocked_id = p_first)
  ) else false end;
$$;
revoke all on function public.users_blocked(uuid, uuid) from public, anon;
grant execute on function public.users_blocked(uuid, uuid) to authenticated;

create function private.reject_blocked_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Query directly: this also covers messages inserted by privileged RPCs.
  if exists (
    select 1 from public.thread_participants tp
    join public.user_blocks b on
      (b.blocker_id = new.sender_id and b.blocked_id = tp.profile_id)
      or (b.blocked_id = new.sender_id and b.blocker_id = tp.profile_id)
    where tp.thread_id = new.thread_id and tp.profile_id <> new.sender_id
  ) then raise exception 'messaging blocked'; end if;
  return new;
end;
$$;
create trigger chat_messages_respect_blocks before insert on public.chat_messages
  for each row execute function private.reject_blocked_message();

-- Restrictive policies combine with existing visibility and membership checks.
create policy "Hide blocked social authors" on public.social_posts as restrictive
  for select to authenticated using (not public.users_blocked(auth.uid(), author_id));
create policy "Hide blocked stream sellers" on public.live_streams as restrictive
  for select to authenticated using (not public.users_blocked(auth.uid(), seller_id));
create policy "Hide blocked stream senders" on public.stream_messages as restrictive
  for select to authenticated using (not public.users_blocked(auth.uid(), sender_id));

create or replace function public.get_or_create_thread(p_other_profile_id uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_thread_id uuid;
begin
  if p_other_profile_id = auth.uid() then
    raise exception 'cannot message yourself';
  end if;
  if not exists (select 1 from public.profiles where id = p_other_profile_id and deleted_at is null) then
    raise exception 'user not found';
  end if;

  if public.users_blocked(auth.uid(), p_other_profile_id) then
    raise exception 'messaging blocked';
  end if;

  -- Two calls at once (a double tap) would each find no thread and each
  -- create one, splitting the conversation. Serialise per pair of people.
  perform pg_advisory_xact_lock(hashtextextended(
    least(auth.uid(), p_other_profile_id)::text || greatest(auth.uid(), p_other_profile_id)::text, 0));

  select tp1.thread_id into v_thread_id
  from public.thread_participants tp1
  join public.thread_participants tp2 on tp1.thread_id = tp2.thread_id
  where tp1.profile_id = auth.uid() and tp2.profile_id = p_other_profile_id
  limit 1;

  if v_thread_id is not null then
    return v_thread_id;
  end if;

  insert into public.chat_threads default values returning id into v_thread_id;
  insert into public.thread_participants (thread_id, profile_id) values
    (v_thread_id, auth.uid()),
    (v_thread_id, p_other_profile_id);

  return v_thread_id;
end;
$$;


create or replace function public.social_feed(p_kind text, p_author_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  return coalesce((
    select jsonb_agg(row order by row->>'created_at' desc)
    from (
      select jsonb_build_object(
        'id', p.id, 'author_id', p.author_id, 'kind', p.kind, 'media_path', p.media_path, 'mime', p.mime, 'caption', p.caption,
        'views', p.views, 'likes', p.likes, 'created_at', p.created_at, 'expires_at', p.expires_at,
        'author_name', pp.business_name, 'author_photo', pp.photo_urls[1], 'author_verified', pp.verified,
        'liked', exists(select 1 from public.post_likes l where l.post_id = p.id and l.profile_id = auth.uid()),
        'product', case when pr.id is not null and pr.status = 'live' then jsonb_build_object('id', pr.id, 'name', pr.name, 'price', pr.price) end) as row
      from public.social_posts p
      join public.provider_profiles pp on pp.id = p.author_id
      left join public.products pr on pr.id = p.product_id
      where p.status = 'live' and (p.expires_at is null or p.expires_at > now())
        and (p_kind is null or p.kind = p_kind) and (p_author_id is null or p.author_id = p_author_id)
        and not public.is_suspended(p.author_id)
        and not public.users_blocked(auth.uid(), p.author_id)
      order by p.created_at desc limit 60
    ) rows), '[]'::jsonb);
end;
$$;


create or replace function public.can_read_social_media(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.social_posts p
    where p.media_path = p_name and p.status = 'live' and (p.expires_at is null or p.expires_at > now())
      and not public.is_suspended(p.author_id)
      and not public.users_blocked(auth.uid(), p.author_id));
$$;

-- The stream RPC uses SECURITY DEFINER, so read policies alone are insufficient.
create function private.reject_blocked_stream_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.live_streams s join public.user_blocks b on
      (b.blocker_id = new.sender_id and b.blocked_id = s.seller_id)
      or (b.blocked_id = new.sender_id and b.blocker_id = s.seller_id)
    where s.id = new.stream_id
  ) then raise exception 'messaging blocked'; end if;
  return new;
end;
$$;
create trigger stream_messages_respect_blocks before insert on public.stream_messages
  for each row execute function private.reject_blocked_stream_message();

-- Service-role video grants must also respect blocks. Existing video tokens
-- expire normally; this prevents issuing any new token after a block.
create or replace function public.stream_access(p_stream_id uuid, p_profile_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.live_streams;
  v_policy jsonb := private.live_video_policy();
  v_state text;
  v_name text;
begin
  select * into s from public.live_streams where id = p_stream_id;
  if s.id is null or s.video <> 'livekit' then return null; end if;
  if exists (select 1 from public.user_blocks b
    where (b.blocker_id = p_profile_id and b.blocked_id = s.seller_id)
       or (b.blocked_id = p_profile_id and b.blocker_id = s.seller_id)) then return null; end if;
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
