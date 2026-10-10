-- ============================================================================
-- U2GAS — minimal Supabase shim for running the SQL suites on plain Postgres
--
--   psql "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/local/00_supabase_shim.sql
--
-- The migrations and the test suites assume a Supabase database: the `auth`
-- schema, the `anon` / `authenticated` / `service_role` roles, and the
-- `auth.uid()` helper the RLS policies read. A stock `postgres:16` container
-- has none of them, so this creates the smallest set that lets the real
-- migrations and the real suites apply unchanged.
--
-- It is deliberately not a Supabase emulator: it creates no Auth API, no
-- Storage, and no PostgREST. It exists so `01_concurrency.sql`, `02_rls.sql`
-- and `03_assets_and_transitions.sql` can be executed and their assertions
-- counted. The hosted project remains the source of truth.
-- ============================================================================

\set ON_ERROR_STOP on

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- Supabase's request roles. NOLOGIN: the suites `set role` into them.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

-- The public schema is where every table, function and policy lives. The
-- request roles reach it, as they do on Supabase.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;

-- --- auth schema ------------------------------------------------------------

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

-- The columns the migrations and suites actually touch. Supabase's real table
-- carries far more; a column the tests never read does not need to exist here.
create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at         timestamptz default now()
);

/**
 * auth.uid() — the caller's id, as PostgREST presents it.
 *
 * PostgREST sets `request.jwt.claims` to the verified JWT payload; the `sub`
 * claim is the auth user id. The suites call `become(role, uid)` which sets
 * exactly this, so the policies read the same claim they read in production.
 * Supabase's own definition also reads `request.jwt.claim.sub` (the older
 * per-claim setting); both are honoured here.
 */
create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub',
    nullif(current_setting('request.jwt.claim.sub', true), '')
  )::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    nullif(current_setting('request.jwt.claim.role', true), ''),
    'anon'
  )
$$;

create or replace function auth.email() returns text
language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email'
$$;

grant execute on function auth.uid(), auth.role(), auth.email()
  to anon, authenticated, service_role;

-- PostgREST's role-switching helper is referenced by nothing here, but the
-- request roles expect to be able to read their own claims.
grant select on auth.users to service_role;

select 'supabase shim ready' as status;
