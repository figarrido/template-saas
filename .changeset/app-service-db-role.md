---
'@template/db': minor
'@template/env': patch
---

Drizzle (`getServiceClient`) now connects as a dedicated, scoped `app_service`
Postgres role instead of the `postgres` owner.

- New migration creates `app_service`: `LOGIN BYPASSRLS`, DML-only on `public` +
  `pgmq` (with default privileges for future objects) and `USAGE` on
  `extensions` — no ownership, DDL, or superuser. It bypasses RLS exactly as the
  owner connection did, but a compromised admin/worker path can no longer drop
  tables, alter roles, or disable RLS. The service-role JWT is unrelated and
  unchanged (it's PostgREST-only and can't back a Postgres DSN).
- `ADMIN_DATABASE_URL` / `WORKER_DATABASE_URL` now carry `app_service`
  credentials; the password is provisioned per environment (never in a
  migration), with a throwaway local password from `supabase/seed.sql`. See the
  new `docs/recipes/secret-rotation.md` — coordinated single-role rotation, with
  zero-downtime A/B rotation documented as the upgrade path.
- Schema tooling (`drizzle-kit introspect`, migrations) and the `auth.users`
  test bootstrap keep using the owner via the new `SUPABASE_DB_URL`.
- Admin reads `auth.users` email through a new `private.user_emails` view
  (owner-defined, `security_invoker = false`) so `app_service` needs no
  auth-schema access; the view is excluded from the API and generated types.
