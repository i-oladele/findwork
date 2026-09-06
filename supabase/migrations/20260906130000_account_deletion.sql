-- In-app account deletion, which Apple requires of any app that creates
-- accounts. A plain delete cannot work here: bookings, orders and the wallet
-- ledger all reference profiles without cascade, so removing a profile that
-- has any history raises a foreign-key violation. Financial records must also
-- be retained for AML purposes regardless of what the user asks for.
--
-- So deletion is anonymisation plus removal of the auth user: the person can
-- no longer sign in and their identifying details are gone, while the rows a
-- counterparty still depends on (their side of a booking, the ledger) survive.

-- The cascade from auth.users would delete the profile row along with the
-- auth user, which is exactly what the foreign keys above forbid. Dropping it
-- lets the profile persist as an anonymised tombstone.
alter table public.profiles drop constraint profiles_id_fkey;

alter table public.profiles add column deleted_at timestamptz;

comment on column public.profiles.deleted_at is
  'Set when the user deletes their account. The row is retained, anonymised, '
  'because other users bookings and the wallet ledger reference it.';

-- Anonymised profiles drop out of provider listings and search.
create or replace function public.anonymise_profile(p_profile_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.profiles
  set full_name = 'Deleted user',
      phone = '',
      email = 'deleted+' || p_profile_id::text || '@findwork.invalid',
      location = null,
      avatar_url = null,
      deleted_at = now()
  where id = p_profile_id;

  -- Stop taking bookings and hide the storefront, if they sold anything.
  update public.provider_profiles
  set taking_bookings = false,
      business_name = 'Deleted user',
      bio = null
  where id = p_profile_id;

  -- Remove content that is theirs alone and that no one else depends on.
  delete from public.classifieds where seller_id = p_profile_id;
  delete from public.job_posts where customer_id = p_profile_id and status = 'open';
end;
$$;

-- Deleted accounts must not appear as bookable providers.
drop policy if exists "Provider profiles are viewable by authenticated users" on public.provider_profiles;

create policy "Provider profiles are viewable by authenticated users"
  on public.provider_profiles for select
  to authenticated
  using (
    not exists (
      select 1 from public.profiles p
      where p.id = provider_profiles.id and p.deleted_at is not null
    )
  );
