# Local development

## Overview

**Decision:** Supabase CLI for the backend stack + native processes for apps/workers, orchestrated by Turborepo. Canonical seed data in `supabase/seed.sql`. Outbound email in dev is routed through Supabase's bundled **InBucket** SMTP catcher via a dev-only `SmtpProvider` (see [07-frontend](./07-frontend.md#email)).

---

## Prerequisites on a dev machine

- Docker (for the Supabase local stack).
- Node + pnpm (apps and Node worker).
- Python + `uv` (Python worker; see [08-platform](./08-platform.md#non-vercel-services-hosting)).
- Stripe CLI (for webhook forwarding to localhost during billing dev).

---

## Run commands

- **`pnpm setup`** (canonical entry point, idempotent): installs deps; runs `supabase start`; applies migrations; runs `supabase/seed.sql`; generates DB types; writes per-surface `.env.local` files by combining `supabase status` output with prompts from `.env.example` for external sandbox keys (Stripe test, PostHog dev, etc.). Re-running won't overwrite existing values but surfaces newly-required vars added to any `packages/env` schema.
- **`pnpm dev`**: `turbo run dev` runs `apps/web`, `apps/admin`, `services/worker-node` (tsx watch), and `services/worker-py` (uv + watchfiles) in parallel. Supabase stays up across reloads.
- **`pnpm dev:webhooks`**: `stripe listen --forward-to localhost:3000/api/webhooks/billing/stripe`. Separate task because it requires a Stripe CLI login.
- **`pnpm db:reset`**: `supabase db reset` (drops, re-applies migrations, re-seeds).
- **`pnpm db:types`**: regenerates `database.types.ts` from the live local schema.

---

## Seed data (`supabase/seed.sql`)

- 1 Operator (in `admin_users`).
- 1 regular User.
- 1 org with both as Members.
- 1 example plan + entitlement record.
- 1 example queued job (so the workers visibly do work right after `pnpm dev`).
- Deliberately small: enough to exercise auth, org/membership, billing, and the job queue end-to-end. Not a fixture buffet.

---

## Email in dev

- `packages/email` exports a provider interface; `ResendProvider` in prod, `SmtpProvider` pointing at InBucket (`localhost`, port from `supabase status`) in dev.
- Adapter selected by `NODE_ENV` / a `MAIL_PROVIDER` env var.
- InBucket's web UI (also surfaced by `supabase status`) shows sent emails with HTML preview.

---

## Other services in dev

- **Sentry:** init guarded by `NODE_ENV === 'production'`. No DSN needed locally.
- **PostHog:** a dev project ID is acceptable; alternatively the client no-ops in dev (`POSTHOG_KEY` absent → no-op).
- **Stripe:** sandbox keys + `stripe listen` per `pnpm dev:webhooks`.

---

## Why

- Next.js HMR and worker tsx-watch reload are dramatically faster running natively than through a bind-mounted Docker volume on macOS. Engineers spend most iteration time in apps/workers, so they get the fast path.
- Supabase CLI's local stack gives **real Postgres with pgmq, pg_cron, RLS, and moddatetime** — the exact failure surface as prod. Anything mocked here would defeat the RLS test suite (see [02-data](./02-data.md#testing)) and the queue runner ([05-jobs](./05-jobs.md)).
- Seed data lives in SQL because the schema lives in SQL (see [02-data](./02-data.md)). One language, one place. RLS tests use the same seed by re-running it through Supabase's test helpers — no parallel factory layer to maintain.
- InBucket is already running in the Supabase local stack; piggy-backing costs nothing.

---

## Tradeoffs

- **Multi-runtime toolchain on the dev machine.** Docker + Node + pnpm + Python + uv + Stripe CLI is a lot to bootstrap. `pnpm setup` covers most of it but the prerequisites are real. Acceptable for a SaaS template.
- **`supabase start` takes ~30s the first time.** Subsequent starts are faster, but the first-time experience is slow. Documented in the README.
- **Turborepo `dev` task output gets noisy** with four parallel processes. Engineers who care can layer `mprocs` on top; not shipping it by default.
- **No factory-based seeding shipped.** If a derived project needs richer test fixtures, they add a TS factory layer for tests. YAGNI until they hit the wall.
- **Email dev adapter is ~50 lines of code prod will never use.** Benefit: every derived project's email development "just works."

**Related:** [02-data](./02-data.md), [05-jobs](./05-jobs.md), [07-frontend](./07-frontend.md), [08-platform](./08-platform.md)
