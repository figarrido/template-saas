# Data

## Multi-tenancy

**Decision:** Single Supabase project, organization/workspace model, isolated via Postgres Row-Level Security (RLS).

Data model sketch:
- `organizations` (organization_id, name, slug, ...)
- `memberships` (membership_id, user_id, organization_id, role) with unique `(user_id, organization_id)`
- All tenant-scoped tables carry `organization_id` with RLS policies keyed on `auth.uid()` + membership.

**Why:**
- Standard SaaS pattern; plays directly to Supabase's strengths.
- RLS enforced at the DB layer — a buggy API route can't leak across tenants.

**Tradeoffs:**
- RLS policies are easy to get subtly wrong. Mitigated by a dedicated RLS test suite (see [Testing](#testing)).
- Some queries get slower under RLS; occasionally needs `security definer` functions for hot paths.
- Cross-tenant analytics for the admin app bypass RLS via the service-role client; never from `apps/web`.

**Related:** [03-auth](./03-auth.md), [04-billing](./04-billing.md)

---

## Query layer

**Decision:** Hybrid. `supabase-js` in `apps/web` (user-context, RLS-honoring). Drizzle with a service-role Postgres connection in `apps/admin` and `services/*` (cross-tenant, complex queries). Types generated from the live schema.

**`packages/db` shape:**
- Exports two named factories — `getUserClient(req)` and `getServiceClient()` — so the security boundary is visible at every call site.
- ESLint rule (in `packages/config/eslint/next.js`, see [11-config](./11-config.md)) forbids importing `getServiceClient` from `apps/web/**`. Bypassing RLS in the client app is a tooling-level error, not a code-review hope.
- Both clients consume the same generated `database.types.ts` (`supabase gen types --linked`). Drizzle's schema is introspected from the live DB (`drizzle-kit introspect`).
- CI check fails if either type source has drifted from what's committed.

**Why:**
- Honoring RLS structurally (not by convention) is the highest-leverage decision in this stack. The factory names make the security boundary visible at every call site.
- Admin and worker queries are legitimately cross-tenant and complex; supabase-js would push call sites into raw RPCs or PostgREST contortions.

**Tradeoffs:**
- Two clients to maintain. Engineers need to know which to use where — mitigated by the linter and factory names.
- Connection pooling splits: `apps/web` via PostgREST (Supabase-managed); admin/workers via Supabase's transaction-mode pooler / PgBouncer.
- Schema drift risk between the two TS type sources. CI check catches it before merge.

**Related:** [09-api-boundary](./09-api-boundary.md), [11-config](./11-config.md)

---

## Schema conventions

**Decision:**

- **Primary keys: UUID v7** via `uuid_generate_v7()` SQL function (or native `gen_random_uuid()` if Supabase's PG version supports v7 at scaffold time — verify before locking).
- **PK naming: `<table_singular>_id`** (`organizations.organization_id`, `profiles.user_id`). Enables `JOIN ... USING (organization_id)` throughout the tenant-scoped surface.
- **Junction tables (e.g., `memberships`):** surrogate `<junction>_id` PK + unique constraint on the natural key.
- **`created_at` + `updated_at`** on every table. `DEFAULT now()` + the `moddatetime` Postgres contrib extension trigger.
- **Soft delete:** column-based (`deleted_at timestamptz null`), opt-in per table. Not defaulted everywhere.
- **Naming:** plural snake_case for tables. No domain prefixes; use Postgres schemas if separation becomes needed.

**Why:**
- UUID v7 is monotonic → b-tree-friendly, fewer page splits, no row-count leakage.
- `<table_singular>_id` + `USING` joins remove a huge amount of boilerplate in a codebase that joins on `organization_id` constantly.
- `moddatetime` is a battle-tested Postgres contrib module; a custom trigger function would be overkill.
- Opt-in soft delete keeps RLS policies, indexes, and queries simple by default.

**Tradeoffs:**
- `<table_singular>_id` breaks the implicit ORM convention that PKs are named `id`. Drizzle and supabase-js are both flexible; configured explicitly per table.
- Surrogate PKs on junction tables cost one extra index. Negligible.
- UUID v7 native support depends on Supabase's PG version. Fallback: `gen_random_uuid()` (v4) with a planned upgrade migration.

**Related:** [03-auth](./03-auth.md), [04-billing](./04-billing.md)

---

## Migration tooling

**Decision:** Supabase CLI. `supabase migration new <name>` → raw SQL files under `supabase/migrations/`. Applied via `supabase db push` (remote) or `supabase db reset` (local).

**Why:**
- RLS policies, Postgres extensions (pgmq, pg_cron, moddatetime), functions, and seed data all live in migration files. Supabase CLI is the only tool that handles the full surface.
- Drizzle-kit can do plain DDL but you'd be using both anyway; cleaner to pick one.

**Tradeoffs:**
- No schema-as-code. Schema lives in SQL migrations, not TS. Accepted: SQL is the lingua franca with Supabase, and RLS policies are SQL anyway.
- Type generation is a manual step locally. CI gate catches missed regens before merge; local DX is a regen npm script run by a Supabase CLI post-migration hook.

**Related:** [12-local-dev](./12-local-dev.md)

---

## Migration deploy order & rollback

**Decision:** **Forward-only, expand-then-contract migrations. DB migrations applied before code in every deploy.**

**Mechanics:**
- Never write down-migrations. Reverting a bad migration = a new compensating forward migration.
- Breaking changes follow expand → dual-read code → backfill → contract-read → drop, across multiple PRs.
- CI gate: prod migrations applied via a dedicated workflow step *before* Vercel and Railway deploys are triggered. Migration failure blocks the deploy.
- Documented in [recipes/migration-patterns.md](../recipes/migration-patterns.md) with worked examples (add NOT NULL column, rename column, drop column, change FK).

**Why:**
- Forward-only matches "SQL is the source of truth" posture.
- Expand-then-contract is the only safe pattern when `apps/web`, `apps/admin`, and the Railway workers deploy on independent cadences.
- DB-first ordering means runtimes always boot against a schema at or ahead of code expectations.

**Tradeoffs:**
- Multi-step migrations span multiple PRs and deploys. Slower than single-shot; far faster than recovery from a broken single-shot.
- No automated rollback. Mitigation: small migrations, and the contract step lands days/weeks after expand.
- Dual-read code is temporary debt. The recipe includes a contract-phase checklist.

**Related:** [05-jobs](./05-jobs.md), [08-platform](./08-platform.md)

---

## Testing

**Decision:** Vitest (unit/integration) + Playwright (E2E). RLS test suite in `packages/db` is the load-bearing safety net.

**Mechanics:**
- **RLS test suite:** spins up local Supabase, seeds multi-tenant data, asserts cross-tenant queries fail. Highest-leverage test the template ships.
- **Migration validation:** CI runs local Supabase per PR with the PR's migrations applied; same infra as the RLS suite.
- Worker services have their own unit tests (Vitest for Node, pytest for Python).
- Gate composition lives in [08-platform](./08-platform.md#ci-specifics).

**Tradeoffs:**
- Playwright E2E adds CI time and flake surface. Mitigation: keep the E2E suite small (golden paths only) and rely on Vitest for breadth.

**Related:** [08-platform](./08-platform.md), [12-local-dev](./12-local-dev.md)
