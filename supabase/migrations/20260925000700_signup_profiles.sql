-- Every way of signing up creates a profile.
--
-- handle_new_user copied new.email into profiles.email, which is NOT NULL.
-- A phone sign-up has no email, so the insert failed, and with it the whole
-- sign-up: the person saw "Database error saving new user" and no account
-- was made. Google and Apple send the person's name as "name", not
-- "full_name", so those accounts started nameless ("Good morning, ").
--
-- Phone users now get an empty email, as phone-only accounts already have an
-- empty phone. The name is taken from whichever key the sign-up method uses.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, email)
  values (
    new.id,
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
