-- Dedicated least-privilege runtime role for Drizzle (apps/admin + services/*).
--
-- docs/architecture/02-data.md § Query layer: getServiceClient drives Drizzle
-- over a raw Postgres connection, so its effective privileges are whatever the
-- connection-string ROLE holds -- NOT the service-role JWT, which is a PostgREST
-- concept and cannot be used as a Postgres password. Until now that role was
-- `postgres`, the database OWNER: it bypasses RLS by table ownership AND carries
-- DDL/superuser-adjacent power. Runtime service code only needs cross-tenant
-- DML, so it gets a scoped role instead.
--
-- app_service:
--   * LOGIN, so it can be a connection-string user. (Supabase's built-in
--     service_role is BYPASSRLS but NOLOGIN -- reachable only via `set role`
--     after PostgREST validates a JWT -- so it cannot back a Drizzle DSN.)
--   * BYPASSRLS, so admin/worker cross-tenant queries see every org's rows --
--     the posture getServiceClient always had, now explicit rather than a
--     side effect of connecting as the owner.
--   * NO ownership, NO DDL, NO superuser: a bug or injection in an admin/worker
--     path can read/write tenant data but cannot drop tables, alter roles, or
--     turn RLS off. Blast radius is bounded to DML.
--
-- Setting BYPASSRLS requires the migration role to hold BYPASSRLS + CREATEROLE.
-- Supabase's `postgres` role has both (verified: rolbypassrls=t, rolcreaterole=t
-- locally and on hosted, where rolsuper=f), so `supabase db push` applies this
-- cleanly.
--
-- Password: deliberately NOT set here. Migrations are committed to git, so a
-- literal password would be a plaintext secret in version control. Until a
-- password is provisioned per environment the role exists but cannot
-- authenticate. Production/staging passwords live only in the platform env
-- embedded in ADMIN_DATABASE_URL / WORKER_DATABASE_URL; local dev gets a
-- throwaway one from supabase/seed.sql. See docs/recipes/secret-rotation.md.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_service') then
    create role app_service with login bypassrls;
  else
    alter role app_service with login bypassrls;
  end if;
end
$$;

-- Public schema: full DML (a trusted service identity), no DDL/ownership. Granted
-- to app_service directly -- not via `authenticated` membership -- so the role is
-- complete even for service-only tables that end users must never touch.
grant usage on schema public to app_service;
grant select, insert, update, delete on all tables in schema public to app_service;
grant usage, select on all sequences in schema public to app_service;
grant execute on all functions in schema public to app_service;

-- Future public objects (created by later migrations, which run as `postgres`)
-- inherit the same grants, so derived projects don't hand-grant every new table.
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to app_service;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to app_service;
alter default privileges for role postgres in schema public
  grant execute on functions to app_service;

-- Extensions schema: PK defaults call public.uuid_generate_v7(), which is
-- `set search_path = extensions` and resolves gen_random_bytes() (pgcrypto)
-- there. Without USAGE on this schema, app_service cannot resolve that name and
-- every INSERT relying on the UUID-v7 default fails with 42883. moddatetime
-- (updated_at trigger) also lives here. Derived projects that add extensions
-- under this schema and call them at runtime grant app_service similarly.
grant usage on schema extensions to app_service;
grant execute on all functions in schema extensions to app_service;

-- pgmq: services/* drive queues through Drizzle. pgmq's functions are SECURITY
-- INVOKER and its q_/a_ tables are owned by `postgres`, so the caller needs
-- direct DML on the pgmq schema -- EXECUTE on the functions alone is not enough
-- (that is why the workers had to connect as the owner before this role existed).
grant usage on schema pgmq to app_service;
grant select, insert, update, delete on all tables in schema pgmq to app_service;
grant usage, select on all sequences in schema pgmq to app_service;
grant execute on all functions in schema pgmq to app_service;

-- Queues added later (pgmq.create in a future migration, run as `postgres`)
-- inherit the same access.
alter default privileges for role postgres in schema pgmq
  grant select, insert, update, delete on tables to app_service;
alter default privileges for role postgres in schema pgmq
  grant usage, select on sequences to app_service;

-- ── Reading auth.users email without an auth-schema grant ────────────────────
--
-- The admin app reads operator/user email through Drizzle (as app_service), but
-- email lives in auth.users -- owned by supabase_auth_admin, not `postgres` --
-- and app_service must not have auth-schema access (that would expose password
-- hashes, MFA secrets, and tokens). `postgres` has USAGE on `auth` but WITHOUT
-- grant option, so it cannot re-grant it to app_service on hosted Supabase.
--
-- Instead, expose exactly id + email through a view in a dedicated `private`
-- schema that `postgres` owns. With security_invoker = false (the default, set
-- explicitly here) the view reads auth.users with the VIEW OWNER's rights
-- (postgres has SELECT on auth.users), so app_service resolves email via the
-- view and needs no auth grant at all. `private` is not in the API's exposed
-- schemas (config.toml) nor in `included_schemas` for type generation, so this
-- never reaches PostgREST or database.types.ts.
create schema if not exists private;

create or replace view private.user_emails
  with (security_invoker = false)
  as select id, email from auth.users;

grant usage on schema private to app_service;
grant select on private.user_emails to app_service;
