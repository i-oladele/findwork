-- PRD service portfolios, videos and provider-supplied credentials.
-- Credentials are explicitly self-reported; uploading one never verifies an identity.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('provider-media', 'provider-media', false, 41943040,
  array['image/jpeg','image/png','image/webp','video/mp4','video/webm','application/pdf']);

create table public.provider_media (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.provider_profiles(id) on delete cascade,
  kind text not null check (kind in ('image', 'video', 'certificate')),
  path text not null unique,
  mime text not null,
  title text not null check (char_length(trim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  created_at timestamptz not null default now()
);
create index provider_media_provider on public.provider_media(provider_id, created_at);
alter table public.provider_media enable row level security;
revoke all on public.provider_media from anon, authenticated;
grant select on public.provider_media to authenticated;
create policy "Signed in visitors read portfolio" on public.provider_media for select to authenticated using (true);

create policy "Provider uploads media" on storage.objects for insert to authenticated with check (
  bucket_id = 'provider-media' and (storage.foldername(name))[1] = auth.uid()::text
  and exists(select 1 from public.provider_profiles where id = auth.uid())
);
create policy "Read published or own provider media" on storage.objects for select to authenticated using (
  bucket_id = 'provider-media' and ((storage.foldername(name))[1] = auth.uid()::text
    or exists(select 1 from public.provider_media where path = name))
);
create policy "Owner removes provider media" on storage.objects for delete to authenticated using (
  bucket_id = 'provider-media' and (storage.foldername(name))[1] = auth.uid()::text
);

create function public.save_provider_media(p_id uuid, p_kind text, p_path text, p_title text, p_description text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_mime text;
  v_bytes bigint;
begin
  perform 1 from public.profiles where id = auth.uid() and deleted_at is null for update;
  if not found or not exists(select 1 from public.provider_profiles where id = auth.uid()) then
    raise exception 'provider not found';
  end if;
  if p_id is not null and not exists(select 1 from public.provider_media where id = p_id and provider_id = auth.uid() and path = p_path) then
    raise exception 'portfolio item not found';
  end if;
  if p_id is null and (select count(*) from public.provider_media where provider_id = auth.uid()) >= 20 then
    raise exception 'You can publish up to 20 portfolio items.';
  end if;
  if p_path is null or split_part(p_path, '/', 1) <> auth.uid()::text then
    raise exception 'invalid media path';
  end if;
  select lower(split_part(metadata->>'mimetype', ';', 1)), (metadata->>'size')::bigint
  into v_mime, v_bytes from storage.objects where bucket_id = 'provider-media' and name = p_path;
  if not found or v_bytes is null or v_bytes < 1 or v_bytes > 41943040 then raise exception 'invalid media file'; end if;
  if p_kind is null or not (
    (p_kind = 'image' and v_mime in ('image/jpeg','image/png','image/webp'))
    or (p_kind = 'video' and v_mime in ('video/mp4','video/webm'))
    or (p_kind = 'certificate' and v_mime in ('application/pdf','image/jpeg','image/png','image/webp'))
  ) or v_mime is null then raise exception 'unsupported media type'; end if;
  insert into public.provider_media(id, provider_id, kind, path, mime, title, description)
  values(v_id, auth.uid(), p_kind, p_path, v_mime, trim(p_title), coalesce(trim(p_description), ''))
  on conflict(id) do update set kind = excluded.kind, title = excluded.title, description = excluded.description;
  return v_id;
end;
$$;

create function public.remove_provider_media(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_path text;
begin
  delete from public.provider_media where id = p_id and provider_id = auth.uid() returning path into v_path;
  if not found then raise exception 'portfolio item not found'; end if;
  return v_path;
end;
$$;

create function private.erase_provider_media()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Revokes new visitor links immediately; previously issued links expire.
  delete from public.provider_media where provider_id = new.id;
  return new;
end;
$$;
create trigger profiles_erase_provider_media after update of deleted_at on public.profiles
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function private.erase_provider_media();

revoke all on function public.save_provider_media(uuid, text, text, text, text) from public, anon;
revoke all on function public.remove_provider_media(uuid) from public, anon;
grant execute on function public.save_provider_media(uuid, text, text, text, text) to authenticated;
grant execute on function public.remove_provider_media(uuid) to authenticated;
