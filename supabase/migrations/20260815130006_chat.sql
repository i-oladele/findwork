create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.chat_threads enable row level security;

create table public.thread_participants (
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (thread_id, profile_id)
);

alter table public.thread_participants enable row level security;

create policy "Participants see their own thread membership"
  on public.thread_participants for select
  to authenticated
  using (profile_id = auth.uid());

create policy "Threads are visible to their participants"
  on public.chat_threads for select
  to authenticated
  using (
    exists (
      select 1 from public.thread_participants tp
      where tp.thread_id = chat_threads.id and tp.profile_id = auth.uid()
    )
  );

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  sender_id uuid not null references public.profiles (id),
  text text not null default '',
  kind text not null default 'text' check (kind in ('text', 'voice')),
  created_at timestamptz not null default now()
);

alter table public.chat_messages enable row level security;

create policy "Participants read messages in their threads"
  on public.chat_messages for select
  to authenticated
  using (
    exists (
      select 1 from public.thread_participants tp
      where tp.thread_id = chat_messages.thread_id and tp.profile_id = auth.uid()
    )
  );

create policy "Participants send messages in their threads"
  on public.chat_messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.thread_participants tp
      where tp.thread_id = chat_messages.thread_id and tp.profile_id = auth.uid()
    )
  );

-- One thread per unordered pair of participants — reuses an existing
-- thread with the other user instead of creating duplicates.
create function public.get_or_create_thread(p_other_profile_id uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_thread_id uuid;
begin
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

create function public.mark_thread_read(p_thread_id uuid)
returns void
language sql
security definer set search_path = public
as $$
  update public.thread_participants
  set last_read_at = now()
  where thread_id = p_thread_id and profile_id = auth.uid();
$$;

alter publication supabase_realtime add table public.chat_messages;
