-- The inbox is summarised per conversation, not from a window of messages.
--
-- The app used to load the newest 500 messages across all of a person's
-- threads and build the inbox from those. One busy conversation could fill
-- all 500, and every other conversation, with real history, vanished from
-- the inbox; unread counts were counted from the same truncated window.
--
-- chat_inbox returns one row per thread with its own latest message and its
-- own unread count, a page at a time. It runs as the caller, so the existing
-- row policies still decide what they can see.

create index chat_messages_thread_created_idx on public.chat_messages (thread_id, created_at desc, id desc);

create function public.chat_inbox(
  p_limit integer default 30,
  p_before_at timestamptz default null,
  p_before_thread uuid default null
)
returns table (
  thread_id uuid,
  last_read_at timestamptz,
  other_id uuid,
  other_name text,
  other_avatar_url text,
  last_message jsonb,
  last_message_at timestamptz,
  unread bigint
)
language sql
stable
security invoker set search_path = public
as $$
  select
    me.thread_id,
    me.last_read_at,
    other.id,
    other.full_name,
    other.avatar_url,
    to_jsonb(last),
    last.created_at,
    (select count(*) from public.chat_messages m
     where m.thread_id = me.thread_id and m.sender_id <> auth.uid() and m.created_at > me.last_read_at)
  from public.thread_participants me
  -- Threads opened but never written in are left out: they are clutter.
  cross join lateral (
    select * from public.chat_messages m
    where m.thread_id = me.thread_id
    order by m.created_at desc, m.id desc
    limit 1
  ) last
  left join lateral (
    select p.id, p.full_name, p.avatar_url
    from public.thread_participants tp
    join public.profiles p on p.id = tp.profile_id
    where tp.thread_id = me.thread_id and tp.profile_id <> auth.uid()
    limit 1
  ) other on true
  where me.profile_id = auth.uid()
    -- Keyset pagination: the page after the last row the app already has.
    and (p_before_at is null or (last.created_at, me.thread_id) < (p_before_at, p_before_thread))
  order by last.created_at desc, me.thread_id desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

revoke execute on function public.chat_inbox(integer, timestamptz, uuid) from public, anon;
grant execute on function public.chat_inbox(integer, timestamptz, uuid) to authenticated;
