-- Enough of Supabase to apply the migrations and run business_rules.sql
-- against a plain Postgres — in CI, or locally without Docker:
--
--   createdb findwork
--   psql findwork -f supabase/checks/postgres_stub.sql
--   for f in supabase/migrations/*.sql; do psql findwork -v ON_ERROR_STOP=1 -f "$f"; done
--   psql findwork -f supabase/seed.sql
--   psql findwork -v ON_ERROR_STOP=1 -f supabase/checks/business_rules.sql
--
-- It stands in for the roles, the auth and storage schemas, and auth.uid(),
-- which real Supabase provides. A test "signs in" by setting the same
-- request.jwt.claim.sub that PostgREST sets:
--
--   set local role authenticated;
--   select set_config('request.jwt.claim.sub', '<uuid>', true);
--
-- Nothing here is deployed; supabase/migrations is the real schema.

-- Minimal stand-in for the parts of Supabase the migrations touch, so they
-- can be applied and exercised against a plain Postgres.
-- Idempotent: roles live on the server, not in the database, so they
-- survive a dropped database.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (
  instance_id uuid, id uuid primary key, aud text, role text, email text, encrypted_password text,
  email_confirmed_at timestamptz, phone text, phone_confirmed_at timestamptz, last_sign_in_at timestamptz,
  raw_app_meta_data jsonb, raw_user_meta_data jsonb, created_at timestamptz, updated_at timestamptz,
  confirmation_token text, email_change text, email_change_token_new text, recovery_token text
);
create table auth.identities (
  id uuid primary key, user_id uuid references auth.users(id) on delete cascade, provider_id text,
  identity_data jsonb, provider text, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.role', true), '')
$$;
grant execute on all functions in schema auth to anon, authenticated, service_role;

create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select string_to_array(name, '/')
$$;

create publication supabase_realtime;
create extension if not exists pgcrypto;
