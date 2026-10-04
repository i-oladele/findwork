-- PRD Stories & Reels and Livestream Selling.
--
-- Stories and reels are photos and short videos a seller posts, optionally
-- tagged with one of their products. A story lasts a day; a reel stays.
--
-- A livestream here is the selling room around a video: the chat, the
-- pinned products and the buying. FindWork does not carry the video itself.
-- The seller broadcasts with whatever they already use and gives the link
-- viewers watch it at.

-- ---------------------------------------------------------------------------
-- 1. Stories and reels
-- ---------------------------------------------------------------------------

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('social-media', 'social-media', false, 52428800, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'])
on conflict (id) do nothing;

create table public.social_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.provider_profiles(id) on delete cascade,
  kind text not null check (kind in ('story', 'reel')),
  media_path text not null unique,
  mime text not null,
  caption text not null default '' check (char_length(caption) <= 500),
  product_id text references public.products(id) on delete set null,
  -- Set for stories, a day after posting; null for reels.
  expires_at timestamptz,
  views integer not null default 0,
  likes integer not null default 0,
  status text not null default 'live' check (status in ('live', 'removed')),
  created_at timestamptz not null default now()
);
create index social_posts_feed on public.social_posts(kind, created_at desc) where status = 'live';
create index social_posts_author on public.social_posts(author_id, created_at desc);
alter table public.social_posts enable row level security;
revoke all on public.social_posts from anon, authenticated;
grant select on public.social_posts to authenticated;
create policy "Live posts are public; an author sees all of their own" on public.social_posts for select to authenticated
  using (author_id = auth.uid() or public.staff_can('moderation')
    or (status = 'live' and (expires_at is null or expires_at > now()) and not public.is_suspended(author_id)));

create function public.can_read_social_media(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.social_posts p
    where p.media_path = p_name and p.status = 'live' and (p.expires_at is null or p.expires_at > now())
      and not public.is_suspended(p.author_id));
$$;
revoke all on function public.can_read_social_media(text) from public, anon;
grant execute on function public.can_read_social_media(text) to authenticated;

create policy "Sellers upload their own social media" on storage.objects for insert to authenticated
  with check (bucket_id = 'social-media' and (storage.foldername(name))[1] = auth.uid()::text
    and exists(select 1 from public.provider_profiles where id = auth.uid()));
create policy "Read published or own social media" on storage.objects for select to authenticated
  using (bucket_id = 'social-media' and ((storage.foldername(name))[1] = auth.uid()::text
    or public.can_read_social_media(name) or public.staff_can('moderation')));
create policy "Owner removes social media" on storage.objects for delete to authenticated
  using (bucket_id = 'social-media' and (storage.foldername(name))[1] = auth.uid()::text);

create function public.publish_post(p_kind text, p_path text, p_caption text, p_product_id text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_mime text; v_bytes bigint; v_id uuid;
begin
  perform 1 from public.profiles where id = auth.uid() and deleted_at is null and suspended_at is null for update;
  if not found or not exists(select 1 from public.provider_profiles where id = auth.uid()) then raise exception 'provider not found'; end if;
  if p_kind is null or p_kind not in ('story', 'reel') then raise exception 'invalid post'; end if;
  if p_path is null or split_part(p_path, '/', 1) <> auth.uid()::text then raise exception 'invalid media path'; end if;
  select lower(split_part(metadata->>'mimetype', ';', 1)), (metadata->>'size')::bigint into v_mime, v_bytes
  from storage.objects where bucket_id = 'social-media' and name = p_path;
  if not found or v_bytes is null or v_bytes < 1 or v_bytes > 52428800 then raise exception 'invalid media file'; end if;
  -- A reel is a video; a story may be a photo.
  if not (v_mime in ('video/mp4', 'video/webm') or (p_kind = 'story' and v_mime in ('image/jpeg', 'image/png', 'image/webp'))) then
    raise exception 'unsupported media type';
  end if;
  if p_product_id is not null and not exists(select 1 from public.products where id = p_product_id and seller_id = auth.uid()) then
    raise exception 'product not found';
  end if;
  if (select count(*) from public.social_posts where author_id = auth.uid() and status = 'live'
      and case when p_kind = 'story' then kind = 'story' and expires_at > now() else kind = 'reel' end)
      >= (case when p_kind = 'story' then 10 else 50 end) then
    raise exception 'too many posts';
  end if;
  insert into public.social_posts(author_id, kind, media_path, mime, caption, product_id, expires_at)
  values (auth.uid(), p_kind, p_path, v_mime, coalesce(trim(p_caption), ''), p_product_id,
    case when p_kind = 'story' then now() + interval '24 hours' end)
  returning id into v_id;
  return v_id;
end;
$$;

create function public.remove_post(p_post_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_path text;
begin
  delete from public.social_posts where id = p_post_id and author_id = auth.uid() returning media_path into v_path;
  if not found then raise exception 'post not found'; end if;
  return v_path;
end;
$$;

-- Engagement: who saw a post and who liked it, each person counted once.
create table public.post_views (
  post_id uuid not null references public.social_posts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (post_id, profile_id)
);
create table public.post_likes (
  post_id uuid not null references public.social_posts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, profile_id)
);
alter table public.post_views enable row level security;
alter table public.post_likes enable row level security;
revoke all on public.post_views from anon, authenticated;
revoke all on public.post_likes from anon, authenticated;
grant select on public.post_likes to authenticated;
create policy "People see their own likes" on public.post_likes for select to authenticated using (profile_id = auth.uid());

create function public.record_post_view(p_post_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_new integer;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  -- An author watching their own post is not an audience.
  insert into public.post_views(post_id, profile_id)
  select p.id, auth.uid() from public.social_posts p
  where p.id = p_post_id and p.status = 'live' and p.author_id <> auth.uid() and (p.expires_at is null or p.expires_at > now())
  on conflict do nothing;
  get diagnostics v_new = row_count;
  if v_new = 1 then update public.social_posts set views = views + 1 where id = p_post_id; end if;
end;
$$;

create function public.toggle_post_like(p_post_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_removed integer; v_likes integer;
begin
  perform 1 from public.profiles where id = auth.uid() and deleted_at is null and suspended_at is null;
  if not found then raise exception 'not authenticated'; end if;
  perform 1 from public.social_posts where id = p_post_id and status = 'live' for update;
  if not found then raise exception 'post not found'; end if;
  delete from public.post_likes where post_id = p_post_id and profile_id = auth.uid();
  get diagnostics v_removed = row_count;
  if v_removed = 0 then
    insert into public.post_likes(post_id, profile_id) values (p_post_id, auth.uid());
  end if;
  update public.social_posts set likes = (select count(*) from public.post_likes where post_id = p_post_id)
  where id = p_post_id returning likes into v_likes;
  return jsonb_build_object('liked', v_removed = 0, 'likes', v_likes);
end;
$$;

-- The feed: live posts, newest first, with who posted them and what they tagged.
create function public.social_feed(p_kind text, p_author_id uuid)
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
      order by p.created_at desc limit 60
    ) rows), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Livestream selling
-- ---------------------------------------------------------------------------

create table public.live_streams (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.provider_profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 3 and 120),
  -- Where the video is watched. The seller broadcasts with their own tool.
  playback_url text not null check (playback_url ~ '^https://' and char_length(playback_url) <= 500),
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'ended')),
  scheduled_for timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  pinned_product_id text references public.products(id) on delete set null,
  peak_viewers integer not null default 0,
  created_at timestamptz not null default now()
);
create index live_streams_status on public.live_streams(status, coalesce(started_at, scheduled_for, created_at) desc);
create table public.stream_products (
  stream_id uuid not null references public.live_streams(id) on delete cascade,
  product_id text not null references public.products(id) on delete cascade,
  position smallint not null default 1,
  primary key (stream_id, product_id)
);
create table public.stream_messages (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid not null references public.live_streams(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 300),
  created_at timestamptz not null default now()
);
create index stream_messages_stream on public.stream_messages(stream_id, created_at desc);
create table public.stream_viewers (
  stream_id uuid not null references public.live_streams(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  primary key (stream_id, profile_id)
);
alter table public.live_streams enable row level security;
alter table public.stream_products enable row level security;
alter table public.stream_messages enable row level security;
alter table public.stream_viewers enable row level security;
revoke all on public.live_streams from anon, authenticated;
revoke all on public.stream_products from anon, authenticated;
revoke all on public.stream_messages from anon, authenticated;
revoke all on public.stream_viewers from anon, authenticated;
grant select on public.live_streams to authenticated;
grant select on public.stream_products to authenticated;
grant select on public.stream_messages to authenticated;
create policy "Streams are public unless the seller is suspended" on public.live_streams for select to authenticated
  using (seller_id = auth.uid() or public.staff_can('moderation') or not public.is_suspended(seller_id));
create policy "Stream products follow their stream" on public.stream_products for select to authenticated
  using (exists(select 1 from public.live_streams s where s.id = stream_id));
create policy "Stream chat follows its stream" on public.stream_messages for select to authenticated
  using (exists(select 1 from public.live_streams s where s.id = stream_id));
create trigger stream_messages_block_suspended before insert on public.stream_messages
  for each row execute function private.block_suspended('sender_id');

create function public.schedule_stream(p_title text, p_playback_url text, p_scheduled_for timestamptz, p_product_ids text[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_product text; v_position smallint := 0;
begin
  perform 1 from public.profiles where id = auth.uid() and deleted_at is null and suspended_at is null for update;
  if not found or not exists(select 1 from public.provider_profiles where id = auth.uid()) then raise exception 'provider not found'; end if;
  if coalesce(p_playback_url, '') !~ '^https://' then raise exception 'invalid stream link'; end if;
  if cardinality(coalesce(p_product_ids, '{}')) > 20 then raise exception 'too many products'; end if;
  if (select count(*) from public.live_streams where seller_id = auth.uid() and status in ('scheduled', 'live')) >= 5 then
    raise exception 'too many streams';
  end if;
  insert into public.live_streams(seller_id, title, playback_url, scheduled_for)
  values (auth.uid(), trim(p_title), trim(p_playback_url), p_scheduled_for) returning id into v_id;
  foreach v_product in array coalesce(p_product_ids, '{}') loop
    v_position := v_position + 1;
    if not exists(select 1 from public.products where id = v_product and seller_id = auth.uid() and status = 'live') then
      raise exception 'product not found';
    end if;
    insert into public.stream_products(stream_id, product_id, position) values (v_id, v_product, v_position) on conflict do nothing;
  end loop;
  return v_id;
end;
$$;

-- start, end, or pin a product (p_product_id) while live.
create function public.update_stream(p_stream_id uuid, p_action text, p_product_id text)
returns void language plpgsql security definer set search_path = public as $$
declare s public.live_streams; v_name text;
begin
  select * into s from public.live_streams where id = p_stream_id for update;
  if s.id is null or s.seller_id <> auth.uid() then raise exception 'stream not found'; end if;
  if p_action = 'start' then
    if s.status <> 'scheduled' then raise exception 'stream cannot be changed'; end if;
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

create function public.send_stream_message(p_stream_id uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform 1 from public.profiles where id = auth.uid() and deleted_at is null and suspended_at is null;
  if not found then raise exception 'not authenticated'; end if;
  if not exists(select 1 from public.live_streams where id = p_stream_id and status = 'live') then raise exception 'stream is not live'; end if;
  if char_length(trim(coalesce(p_body, ''))) not between 1 and 300 then raise exception 'invalid message'; end if;
  -- One message every two seconds is plenty for a person and too slow for a flood.
  if exists(select 1 from public.stream_messages where stream_id = p_stream_id and sender_id = auth.uid()
      and created_at > clock_timestamp() - interval '2 seconds') then
    raise exception 'slow down';
  end if;
  insert into public.stream_messages(stream_id, sender_id, body) values (p_stream_id, auth.uid(), trim(p_body)) returning id into v_id;
  return v_id;
end;
$$;

-- The seller, or a moderator, takes a message out of the chat.
create function public.remove_stream_message(p_message_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.stream_messages m using public.live_streams s
  where m.id = p_message_id and s.id = m.stream_id and (s.seller_id = auth.uid() or public.staff_can('moderation'));
  if not found then raise exception 'message not found'; end if;
end;
$$;

-- Called every so often by each viewer's screen; returns how many are watching now.
create function public.stream_heartbeat(p_stream_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not exists(select 1 from public.live_streams where id = p_stream_id and status = 'live') then return 0; end if;
  insert into public.stream_viewers(stream_id, profile_id) values (p_stream_id, auth.uid())
  on conflict (stream_id, profile_id) do update set last_seen_at = now();
  select count(*) into v_count from public.stream_viewers where stream_id = p_stream_id and last_seen_at > now() - interval '45 seconds';
  update public.live_streams set peak_viewers = greatest(peak_viewers, v_count) where id = p_stream_id and peak_viewers < v_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Reporting posts and streams
-- ---------------------------------------------------------------------------

alter table public.reports drop constraint reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('classified', 'message', 'profile', 'job', 'rfq', 'post', 'stream'));

create or replace function public.admin_resolve_report(p_report_id uuid, p_action text)
returns void language plpgsql security definer set search_path = public as $$
declare v_report public.reports;
begin
  if not public.staff_can('moderation') then raise exception 'admins only'; end if;
  if p_action not in ('remove', 'dismiss') then raise exception 'invalid action'; end if;
  select * into v_report from public.reports where id = p_report_id for update;
  if v_report is null then raise exception 'report not found'; end if;

  if p_action = 'remove' then
    case v_report.target_type
      when 'classified' then delete from public.classifieds where id = v_report.target_id::uuid;
      when 'message' then delete from public.chat_messages where id = v_report.target_id::uuid;
      when 'job' then update public.job_posts set status = 'closed' where id = v_report.target_id::uuid;
      when 'rfq' then update public.rfqs set status = 'closed' where id = v_report.target_id::uuid;
      when 'post' then update public.social_posts set status = 'removed' where id = v_report.target_id::uuid;
      when 'stream' then update public.live_streams set status = 'ended', ended_at = now(), pinned_product_id = null
        where id = v_report.target_id::uuid and status <> 'ended';
      else null;
    end case;
  end if;

  -- Every report on the same target is settled together.
  update public.reports
  set status = case when p_action = 'remove' then 'actioned' else 'dismissed' end,
      resolved_by = auth.uid(), resolved_at = now()
  where target_type = v_report.target_type and target_id = v_report.target_id and status = 'open';
end;
$$;

revoke all on function public.publish_post(text, text, text, text) from public, anon;
revoke all on function public.remove_post(uuid) from public, anon;
revoke all on function public.record_post_view(uuid) from public, anon;
revoke all on function public.toggle_post_like(uuid) from public, anon;
revoke all on function public.social_feed(text, uuid) from public, anon;
revoke all on function public.schedule_stream(text, text, timestamptz, text[]) from public, anon;
revoke all on function public.update_stream(uuid, text, text) from public, anon;
revoke all on function public.send_stream_message(uuid, text) from public, anon;
revoke all on function public.remove_stream_message(uuid) from public, anon;
revoke all on function public.stream_heartbeat(uuid) from public, anon;
grant execute on function public.publish_post(text, text, text, text) to authenticated;
grant execute on function public.remove_post(uuid) to authenticated;
grant execute on function public.record_post_view(uuid) to authenticated;
grant execute on function public.toggle_post_like(uuid) to authenticated;
grant execute on function public.social_feed(text, uuid) to authenticated;
grant execute on function public.schedule_stream(text, text, timestamptz, text[]) to authenticated;
grant execute on function public.update_stream(uuid, text, text) to authenticated;
grant execute on function public.send_stream_message(uuid, text) to authenticated;
grant execute on function public.remove_stream_message(uuid) to authenticated;
grant execute on function public.stream_heartbeat(uuid) to authenticated;
