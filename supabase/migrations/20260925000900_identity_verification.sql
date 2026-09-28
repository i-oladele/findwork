-- Every account can be verified, not only providers.
--
-- Verification used to exist only for providers: they asked, and an admin
-- switched on their badge. Now anyone who signs up is asked to verify, from
-- a notice on Home. They send a government ID (type, number, a photo of it)
-- and a selfie. The FindWork team compares them and approves or rejects,
-- with a reason the person sees. Approval marks the account verified, and a
-- provider's badge with it.
--
-- The review is by hand for now. An automatic NIN or BVN check through a KYC
-- provider (Smile ID, Dojah, Prembly, YouVerify…) can take the admin's place
-- later without changing any of this: it would call the same review step.
--
-- ID numbers and photos are the most sensitive things the app holds. They
-- are readable only by their owner and by admins, and they are never
-- changed once sent: a submission is evidence of what was checked.

-- ---------------------------------------------------------------------------
-- Who is verified
-- ---------------------------------------------------------------------------

-- Set only by admin_review_verification: no column grant lets a user write it.
-- Readable in your own row (get_my_profile); others see a provider's badge.
alter table public.profiles add column verified_at timestamptz;

-- A provider with the badge is a verified account, however the badge came:
-- set before this, by the seed, or by an admin.
create function private.sync_provider_verified()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.verified then
    update public.profiles set verified_at = coalesce(verified_at, now()) where id = new.id;
  end if;
  return new;
end;
$$;

create trigger provider_profiles_sync_verified
  after insert or update of verified on public.provider_profiles
  for each row execute procedure private.sync_provider_verified();

update public.profiles p set verified_at = now()
from public.provider_profiles pp
where pp.id = p.id and pp.verified;

-- ---------------------------------------------------------------------------
-- The documents
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public) values ('verification-documents', 'verification-documents', false);

create policy "Owner upload: verification documents"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'verification-documents' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Owner and admins read: verification documents"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'verification-documents' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ---------------------------------------------------------------------------
-- Submissions
-- ---------------------------------------------------------------------------

create table public.verifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id),
  id_type text not null check (id_type in ('nin', 'bvn', 'passport', 'drivers_licence', 'voters_card')),
  id_number text not null check (char_length(id_number) between 5 and 30),
  document_path text not null,
  selfie_path text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  -- Why it was rejected, shown to the person; or the reviewer's note.
  note text,
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index verifications_one_pending on public.verifications (profile_id) where status = 'pending';
create index verifications_status_idx on public.verifications (status, created_at);

alter table public.verifications enable row level security;

create policy "People see their own verifications, admins all"
  on public.verifications for select
  to authenticated
  using (profile_id = auth.uid() or public.is_admin());

-- No insert or update policy: submit_verification and
-- admin_review_verification are the only ways in.
revoke insert, update, delete on public.verifications from anon, authenticated;

create function public.submit_verification(
  p_id_type text,
  p_id_number text,
  p_document_path text,
  p_selfie_path text
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_profile public.profiles;
  v_number text := upper(regexp_replace(coalesce(p_id_number, ''), '[\s-]', '', 'g'));
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- Serialises a double tap: one submission waits for the other.
  select * into v_profile from public.profiles where id = auth.uid() for update;
  if v_profile.verified_at is not null then
    raise exception 'already_verified';
  end if;
  if exists (select 1 from public.verifications where profile_id = auth.uid() and status = 'pending') then
    raise exception 'verification_pending';
  end if;

  if p_id_type is null or p_id_type not in ('nin', 'bvn', 'passport', 'drivers_licence', 'voters_card') then
    raise exception 'invalid id type';
  end if;
  -- NIN and BVN are both 11 digits; other IDs vary by issuer.
  if (p_id_type in ('nin', 'bvn') and v_number !~ '^[0-9]{11}$') or char_length(v_number) not between 5 and 30 then
    raise exception 'invalid id number';
  end if;

  -- Both photos must be the caller's own uploads, already in the bucket.
  if split_part(coalesce(p_document_path, ''), '/', 1) <> auth.uid()::text
     or split_part(coalesce(p_selfie_path, ''), '/', 1) <> auth.uid()::text
     or p_document_path = p_selfie_path
     or not exists (select 1 from storage.objects where bucket_id = 'verification-documents' and name = p_document_path)
     or not exists (select 1 from storage.objects where bucket_id = 'verification-documents' and name = p_selfie_path) then
    raise exception 'verification photos missing';
  end if;

  insert into public.verifications (profile_id, id_type, id_number, document_path, selfie_path)
  values (auth.uid(), p_id_type, v_number, p_document_path, p_selfie_path)
  returning id into v_id;

  perform private.notify_admins('system', 'Verification to review',
    coalesce(nullif(v_profile.full_name, ''), 'A new account') || ' sent their ID', 'admin_verification', v_id::text);

  return v_id;
end;
$$;

create function public.admin_review_verification(p_verification_id uuid, p_approve boolean, p_note text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.verifications;
begin
  if not public.is_admin() then
    raise exception 'admins only';
  end if;
  if p_approve is null then
    raise exception 'invalid outcome';
  end if;

  select * into v_row from public.verifications where id = p_verification_id for update;
  if v_row is null then
    raise exception 'verification not found';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'verification already reviewed';
  end if;
  -- The person is told why, so they can put it right.
  if not p_approve and coalesce(trim(p_note), '') = '' then
    raise exception 'reason required';
  end if;

  update public.verifications
  set status = case when p_approve then 'approved' else 'rejected' end,
      note = nullif(trim(p_note), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_verification_id;

  if p_approve then
    update public.profiles set verified_at = now() where id = v_row.profile_id;
    update public.provider_profiles set verified = true where id = v_row.profile_id;
    perform public.notify(v_row.profile_id, 'system', 'You are verified',
      'You can now use every FindWork service.', 'verification', p_verification_id::text);
  else
    perform public.notify(v_row.profile_id, 'system', 'Your verification needs another look',
      trim(p_note), 'verification', p_verification_id::text);
  end if;
end;
$$;

revoke execute on function public.submit_verification(text, text, text, text) from public, anon;
grant execute on function public.submit_verification(text, text, text, text) to authenticated;
revoke execute on function public.admin_review_verification(uuid, boolean, text) from public, anon;
grant execute on function public.admin_review_verification(uuid, boolean, text) to authenticated;

-- The older one-click provider check stays for admins, and now keeps the
-- account's verified status in step with the badge.
create or replace function public.admin_set_provider_verified(p_provider_id uuid, p_verified boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admins only';
  end if;

  update public.provider_profiles set verified = p_verified where id = p_provider_id;
  if not found then
    raise exception 'provider not found';
  end if;
  update public.profiles
  set verified_at = case when p_verified then coalesce(verified_at, now()) end
  where id = p_provider_id;

  if p_verified then
    perform public.notify(p_provider_id, 'system', 'You are verified',
      'Customers now see the Verified badge on your profile.', 'provider', p_provider_id::text);
  end if;
end;
$$;
