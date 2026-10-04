-- PRD: Shopping Cart & Checkout / Address management.
-- Addresses are private. Mutations serialize on the owner's profile so that
-- simultaneous default changes and deletions cannot leave two defaults.
create table public.saved_addresses (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  label text not null check (char_length(trim(label)) between 1 and 40),
  recipient text not null check (char_length(trim(recipient)) between 1 and 120),
  phone text not null check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  address text not null check (char_length(trim(address)) between 6 and 500),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index saved_addresses_one_default on public.saved_addresses(profile_id) where is_default;
create index saved_addresses_owner on public.saved_addresses(profile_id, created_at);
alter table public.saved_addresses enable row level security;
revoke all on public.saved_addresses from anon, authenticated;
grant select on public.saved_addresses to authenticated;
create policy "Address owner reads" on public.saved_addresses for select to authenticated
  using (profile_id = auth.uid());

create function public.save_address(
  p_id uuid, p_label text, p_recipient text, p_phone text, p_address text, p_default boolean
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_default boolean;
begin
  perform 1 from public.profiles where id = auth.uid() and deleted_at is null for update;
  if not found then raise exception 'not authenticated'; end if;
  if p_id is not null and not exists (
    select 1 from public.saved_addresses where id = p_id and profile_id = auth.uid()
  ) then raise exception 'address not found'; end if;
  if p_id is null and (select count(*) from public.saved_addresses where profile_id = auth.uid()) >= 20 then
    raise exception 'You can save up to 20 addresses.';
  end if;
  -- Editing a default keeps it default. Select another address to switch it.
  v_default := coalesce(p_default, false) or not exists (
    select 1 from public.saved_addresses where profile_id = auth.uid() and is_default and id <> v_id
  );
  if v_default then
    update public.saved_addresses set is_default = false where profile_id = auth.uid() and is_default;
  end if;
  insert into public.saved_addresses(id, profile_id, label, recipient, phone, address, is_default)
  values(v_id, auth.uid(), trim(p_label), trim(p_recipient), trim(p_phone), trim(p_address), v_default)
  on conflict(id) do update set label = excluded.label, recipient = excluded.recipient,
    phone = excluded.phone, address = excluded.address, is_default = excluded.is_default;
  return v_id;
end;
$$;

create function public.delete_address(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.profiles where id = auth.uid() and deleted_at is null for update;
  if not found then raise exception 'not authenticated'; end if;
  delete from public.saved_addresses where id = p_id and profile_id = auth.uid();
  if not found then raise exception 'address not found'; end if;
  if not exists(select 1 from public.saved_addresses where profile_id = auth.uid() and is_default) then
    update public.saved_addresses set is_default = true where id = (
      select id from public.saved_addresses where profile_id = auth.uid() order by created_at, id limit 1
    );
  end if;
end;
$$;

-- Account deletion anonymizes profiles rather than deleting them. Erase this
-- private address book in that same transaction, not just on a hard delete.
create function private.erase_saved_addresses()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.saved_addresses where profile_id = new.id;
  return new;
end;
$$;
create trigger profiles_erase_saved_addresses after update of deleted_at on public.profiles
  for each row when (old.deleted_at is null and new.deleted_at is not null)
  execute function private.erase_saved_addresses();

revoke all on function public.save_address(uuid, text, text, text, text, boolean) from public, anon;
revoke all on function public.delete_address(uuid) from public, anon;
grant execute on function public.save_address(uuid, text, text, text, text, boolean) to authenticated;
grant execute on function public.delete_address(uuid) to authenticated;
