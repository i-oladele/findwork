-- First and last name, kept separately.
--
-- Sign-up asks for a first and a last name rather than one "full name" box.
-- Keeping them apart means greetings use the right name, and payments and
-- identity checks, which ask for them separately, can be filled in without
-- guessing where one name ends.
--
-- full_name stays, as the name everyone else sees: every screen, review and
-- order already reads it. A trigger keeps the three consistent whichever is
-- written. Setting first or last name rebuilds full_name. Setting only
-- full_name (older app versions, the seed, anonymising a deleted account)
-- splits it at the first space.

alter table public.profiles
  add column first_name text not null default '',
  add column last_name text not null default '';

create function private.sync_profile_names()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.first_name <> '' or new.last_name <> '' then
      new.full_name := trim(new.first_name || ' ' || new.last_name);
    else
      new.first_name := split_part(trim(new.full_name), ' ', 1);
      new.last_name := trim(substr(trim(new.full_name), length(new.first_name) + 1));
    end if;
  elsif new.first_name is distinct from old.first_name or new.last_name is distinct from old.last_name then
    new.full_name := trim(new.first_name || ' ' || new.last_name);
  elsif new.full_name is distinct from old.full_name then
    new.first_name := split_part(trim(new.full_name), ' ', 1);
    new.last_name := trim(substr(trim(new.full_name), length(new.first_name) + 1));
  end if;
  new.first_name := trim(new.first_name);
  new.last_name := trim(new.last_name);
  return new;
end;
$$;

create trigger profiles_sync_names
  before insert or update of first_name, last_name, full_name on public.profiles
  for each row execute procedure private.sync_profile_names();

-- Existing accounts: split the name they gave at the first space.
update public.profiles
set first_name = split_part(trim(full_name), ' ', 1),
    last_name = trim(substr(trim(full_name), length(split_part(trim(full_name), ' ', 1)) + 1))
where trim(full_name) <> '';

-- Editable by their owner, like full_name. Not readable by other people:
-- they see full_name, and your own row comes from get_my_profile.
grant update (first_name, last_name) on public.profiles to authenticated;

-- Sign-up sends first_name and last_name; Google sends given_name and
-- family_name; older app versions and Apple send full_name or name.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name, full_name, phone, email)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'first_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'given_name'), ''),
      ''
    ),
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'last_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'family_name'), ''),
      ''
    ),
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      ''
    ),
    -- The app sends E.164 in metadata; auth itself stores the number bare.
    coalesce(
      nullif(new.raw_user_meta_data ->> 'phone', ''),
      '+' || nullif(ltrim(new.phone, '+'), ''),
      ''
    ),
    coalesce(new.email, '')
  );
  return new;
end;
$$;
