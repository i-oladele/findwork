-- Private conversation media. Files are immutable and live under
-- <sender>/<thread>/<message id>.<extension>; signed links expire in 10 minutes.
alter table public.chat_messages
  add column attachment_path text,
  add column attachment_name text,
  add column attachment_mime text,
  add column attachment_bytes bigint;
alter table public.chat_messages drop constraint chat_messages_kind_check;
alter table public.chat_messages add constraint chat_messages_kind_check
  check (kind in ('text', 'voice', 'image', 'video', 'file'));
create unique index chat_messages_attachment_path_unique
  on public.chat_messages(attachment_path) where attachment_path is not null;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('chat-attachments', 'chat-attachments', false, 20971520,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm',
    'audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/wav', 'application/pdf']);

create policy "Participants upload conversation attachments"
  on storage.objects for insert to authenticated with check (
    bucket_id = 'chat-attachments' and (storage.foldername(name))[1] = auth.uid()::text
    and exists (select 1 from public.thread_participants tp
      where tp.thread_id::text = (storage.foldername(name))[2] and tp.profile_id = auth.uid())
  );

create policy "Participants read shared conversation attachments"
  on storage.objects for select to authenticated using (
    bucket_id = 'chat-attachments' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (select 1 from public.chat_messages m
        where m.attachment_path = name and public.is_thread_participant(m.thread_id))
    )
  );

-- Deletion is restricted to unsent uploads. A sent attachment is part of the
-- conversation record and can be removed through the moderation workflow.
create policy "Senders remove unsent conversation attachments"
  on storage.objects for delete to authenticated using (
    bucket_id = 'chat-attachments' and (storage.foldername(name))[1] = auth.uid()::text
    and not exists (select 1 from public.chat_messages m where m.attachment_path = name)
  );

-- Attachment metadata can only be written through the validated RPC. Existing
-- direct text insertion remains supported, without forged creation timestamps.
revoke insert on public.chat_messages from public, anon, authenticated;
grant insert(id, thread_id, sender_id, text, kind) on public.chat_messages to authenticated;

create function private.validate_chat_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if length(new.text) > 2000 then raise exception 'message too long'; end if;
  if new.kind = 'text' then
    if length(trim(new.text)) = 0 then raise exception 'message is empty'; end if;
    if new.attachment_path is not null then raise exception 'invalid attachment'; end if;
  elsif new.attachment_path is null or new.attachment_mime is null
      or new.attachment_bytes is null or new.attachment_bytes not between 1 and 20971520 then
    raise exception 'invalid attachment';
  end if;
  new.created_at := now();
  return new;
end;
$$;
create trigger chat_messages_validate before insert on public.chat_messages
  for each row execute function private.validate_chat_message();

create function public.send_chat_attachment(
  p_message_id uuid, p_thread_id uuid, p_path text, p_name text, p_text text default ''
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_object storage.objects;
  v_existing public.chat_messages;
  v_mime text;
  v_bytes bigint;
  v_kind text;
begin
  if auth.uid() is null or not public.is_thread_participant(p_thread_id) then
    raise exception 'not a conversation participant';
  end if;
  if p_message_id is null then raise exception 'invalid attachment'; end if;
  perform pg_advisory_xact_lock(hashtextextended('chat-message:' || p_message_id::text, 0));
  select * into v_existing from public.chat_messages where id = p_message_id;
  if found then
    if v_existing.sender_id = auth.uid() and v_existing.thread_id = p_thread_id
      and v_existing.attachment_path = p_path then return v_existing.id; end if;
    raise exception 'invalid attachment';
  end if;
  if p_path is null or split_part(p_path, '/', 1) <> auth.uid()::text
    or split_part(p_path, '/', 2) <> p_thread_id::text
    or split_part(split_part(p_path, '/', 3), '.', 1) <> p_message_id::text
    or array_length(string_to_array(p_path, '/'), 1) <> 3 then
    raise exception 'invalid attachment';
  end if;

  select * into v_object from storage.objects
    where bucket_id = 'chat-attachments' and name = p_path for share;
  if not found then raise exception 'attachment not uploaded'; end if;
  v_mime := lower(split_part(v_object.metadata->>'mimetype', ';', 1));
  v_bytes := (v_object.metadata->>'size')::bigint;
  if v_bytes is null or v_bytes not between 1 and 20971520 then raise exception 'invalid attachment'; end if;
  v_kind := case
    when v_mime in ('image/jpeg', 'image/png', 'image/webp', 'image/gif') then 'image'
    when v_mime in ('video/mp4', 'video/webm') then 'video'
    when v_mime in ('audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/wav') then 'voice'
    when v_mime = 'application/pdf' then 'file'
    else null end;
  if v_kind is null then raise exception 'unsupported attachment type'; end if;
  insert into public.chat_messages(id, thread_id, sender_id, text, kind,
    attachment_path, attachment_name, attachment_mime, attachment_bytes)
    values (p_message_id, p_thread_id, auth.uid(), trim(coalesce(p_text, '')), v_kind,
      p_path, left(coalesce(nullif(trim(p_name), ''), 'Attachment'), 180), v_mime, v_bytes);
  return p_message_id;
end;
$$;
revoke all on function public.send_chat_attachment(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.send_chat_attachment(uuid, uuid, text, text, text) to authenticated;

create or replace function public.notify_on_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_sender text;
begin
  select full_name into v_sender from public.profiles where id = new.sender_id;
  insert into public.notifications(profile_id, kind, title, body, ref_type, ref_id)
  select tp.profile_id, 'message', coalesce(nullif(v_sender, ''), 'New message'),
    case new.kind
      when 'voice' then 'Sent a voice note'
      when 'image' then 'Sent a photo'
      when 'video' then 'Sent a video'
      when 'file' then 'Sent a document'
      else left(new.text, 140) end,
    'thread', new.thread_id::text
  from public.thread_participants tp
  where tp.thread_id = new.thread_id and tp.profile_id <> new.sender_id;
  return new;
end;
$$;
