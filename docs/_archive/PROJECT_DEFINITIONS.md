# SaaS Template — Architecture Decisions

Decisions captured during initial scoping. Each section: **Decision**, **Why**, **Tradeoffs**, and any **Open questions**.

---

## 0. Guiding principles

These constrain every section below. When a decision later in the doc seems to violate one, the decision is wrong, not the principle.

- **This is a template, not a product.** First product built from the template (planned: Chilean SaaS) is *context* for what abstractions need to exist, not a directive to bake product-specific code into the template.
- **Ship abstractions + one reference implementation, not concrete vendors.** Country-specific, jurisdiction-specific, or product-specific adapters live in derived projects, written against the template's interfaces. The template carries only what's needed to exercise and document the abstraction.
- **Optimize for "fast to add later," not "covers everything now."** Every concrete vendor adapter shipped in the template is weight every derived product has to carry, audit, and update. Prefer a well-shaped seam over a pre-built bridge.
- **Pick the most universal reference.** When the template needs *one* concrete example to validate an interface (e.g., a charging adapter), pick the option with the widest applicability, best sandbox/test mode, and best docs — not the option most relevant to the first product.

---

## 1. Stack baseline

**Decision:** Next.js (App Router) + Supabase + Tailwind + Vercel, as a TypeScript monorepo.

**Why:** The user already ships on this stack; minimizes ramp-up and matches Vercel's deploy story. Supabase covers Postgres + Auth + Storage + Edge Functions in one product, which removes a lot of glue code for a template.

**Tradeoffs:**
- Vendor concentration on Supabase (auth, DB, storage). Migrations off Supabase are doable (it's Postgres underneath) but Auth and RLS policies are the stickiest pieces.
- Vercel pricing curves steeply at scale, especially for image optimization and function invocations. Acceptable for a template; revisit if a derived product hits scale.
- App Router is the right long-term bet but has rougher edges than Pages Router for some patterns (auth, streaming, error boundaries). Worth eating the cost now to avoid a migration later.

---

## 2. Monorepo

**Decision:** Turborepo + pnpm workspaces.

**Layout:**
```
apps/
  web/          # client-facing Next.js app
  admin/        # internal admin Next.js app
services/
  worker-node/  # long-running Node/TS jobs (Railway)
  worker-py/    # Python workers for ML/data/scraping (Railway)
packages/
  ui/           # shadcn/ui components, Tailwind preset
  db/           # Two-factory DB access (see §11): supabase-js for user-context, Drizzle for service-role. Generated types live here too.
  env/          # Per-surface Zod env schemas + auto-generated .env.example (see §13)
  flags/        # OpenFeature client + PostHog reference provider (see §14)
  billing/      # Provider-agnostic billing layer + Stripe reference adapter (see §9). EmitterProvider interface for tax docs.
  auth/         # auth helpers shared across web + admin
  config/       # eslint, tsconfig, tailwind base configs
  jobs/         # shared queue interface + job type definitions
  email/        # React Email templates + Resend client (prod) / SMTP→InBucket (dev)
  observability/# Pino + structlog + OpenTelemetry init + structured-field conventions (see §15). Sentry SDK setup also lives here.
```

**Why:** Turborepo is Vercel-native (remote cache works out of the box on Vercel deploys), and pnpm workspaces are the de-facto standard for Next monorepos. The `services/` directory is deliberately separated from `apps/` so non-Vercel deploy targets don't get confused with Vercel projects.

**Tradeoffs:**
- Turborepo's task graph is simpler than Nx but less powerful — fine here, would re-evaluate if many non-JS targets show up.
- `packages/jobs` as a shared package means the type contract for job payloads is enforced across enqueuer (Next.js) and consumer (Node worker). Python worker will need a duplicated schema (likely Pydantic generated from JSON Schema) — accepted cost.

---

## 3. Admin vs. client app

**Decision:** Two separate Next.js apps (`apps/web`, `apps/admin`), each deployed as its own Vercel project, sharing `packages/*`.

**Why:** Clean isolation of attack surface — admin enforces stricter app-layer access (§5) and there's no risk of leaking admin code into the client bundle. Edge-layer controls (Cloudflare Access, Vercel Deployment Protection, IP allowlist) are recipes, not template code (see §5). Both apps share `packages/ui` and `packages/db`, so feature parity stays cheap.

**Tradeoffs:**
- Two Vercel projects = two sets of env vars and two deploys. Acceptable; Turborepo handles incremental builds.
- Admin gets its own subdomain (e.g., `admin.example.com`) — needs to be planned in DNS from day one.
- Admin auth surface is separate. Decision below in §5.

---

## 4. Multi-tenancy

**Decision:** Single Supabase project, organization/workspace model, isolated via Postgres Row-Level Security (RLS).

**Data model sketch:**
- `organizations` (id, name, slug, ...)
- `memberships` (user_id, org_id, role)
- All tenant-scoped tables carry `org_id` with RLS policies keyed on `auth.uid()` + membership.

**Why:** Standard SaaS pattern, plays directly to Supabase's strengths. RLS is enforced at the DB layer, so even a buggy API route can't leak across tenants.

**Tradeoffs:**
- RLS policies are easy to get subtly wrong. The template needs a **dedicated RLS test suite** (see §10) to lock in the invariants.
- Some queries get slower under RLS — usually fine, occasionally needs `security definer` functions for hot paths.
- Cross-tenant analytics (for the admin app) need to bypass RLS — use the service-role key from the admin app's server only, never from the client.

---

## 5. Authentication

**Decision:** Supabase Auth for end users; admin app uses Supabase Auth with a separate `is_admin` claim/role check enforced both at RLS and at the Next.js middleware layer.

**Why:** Reuses Supabase, no second auth provider. Admin role lives in a separate `admin_users` table (not just a column on `users`) so the admin grant is auditable.

**Deployment:** Admin app lives on a dedicated subdomain (e.g., `admin.example.com`), separate Vercel project from the client app. DNS and Vercel project setup planned from day one.

**Access enforcement (app-layer, ships in template):**
- Next.js middleware in `apps/admin` enforces, in order: (1) authenticated session, (2) `admin_users` row exists for the user, (3) MFA factor present and verified within the session lifetime. Any failure → 404 (not 403 — admin existence shouldn't be discoverable).
- `apps/admin` always uses the service-role Supabase client server-side for cross-tenant queries; never the user's JWT. This is the single legitimate place service-role appears outside of the worker services.
- Audit log: every state-changing admin action writes to an append-only `admin_audit_log` table (actor, target, action, before/after diff, timestamp, IP).

**Edge controls (vendor-specific, NOT in template — shipped as recipes in `docs/recipes/admin-edge-access.md`):**
- Recipe: Cloudflare Access (recommended for most teams — free <50 users, Google Workspace SSO, identity-aware proxy).
- Recipe: Vercel Deployment Protection (simplest for Vercel-only orgs; ties to Vercel accounts).
- Recipe: IP allowlist via Vercel middleware (for static-IP/VPN setups).

**Tradeoffs:**
- Admin app shares the auth provider with the client app — a compromised Supabase project compromises both. Mitigation: hardware-key MFA enforced in middleware, plus edge controls layered per the recipes above.
- Subdomain isolation gives us cookie-scope separation (client cookies on the apex / app subdomain don't apply to `admin.`) and lets edge controls be added without code changes.
- 404 (instead of 403) for missing-admin status leaks slightly less but breaks "helpful error message" UX. Accepted — wrong audience for friendly errors.

---

## 6. Background jobs & queues

**Decision:** Queue substrate is **Supabase Queues (pgmq)**. Scheduled enqueues use **`pg_cron`**. Runner ergonomics (typed payloads, retry policy, DLQ, dispatcher) are provided by our own thin wrapper in `packages/jobs` (TS) with a mirrored Python module for the Python worker.

**Architecture:**
- Producers: Next.js apps (`apps/web`, `apps/admin`) enqueue via supabase-js calling `pgmq.send`. Inserts that need transactional enqueue use a Postgres function that wraps the write + `pgmq.send` in one call. Edge Functions and DB triggers can also enqueue directly — useful for event-driven flows (e.g., row insert → job) without app round-trips.
- Consumers: `services/worker-node` and `services/worker-py` each poll their assigned queues with `pgmq.read` (long-poll w/ visibility timeout), process, then `pgmq.delete` on success or let visibility expire on failure to trigger a retry.
- Scheduled jobs: `pg_cron` rows that call `pgmq.send` on a schedule (replaces Graphile-style built-in cron).
- `packages/jobs` exports:
  - The TS job-type contract (`defineJob`, typed payloads via Zod).
  - A `runWorker` helper that codifies the retry curve, max-attempt → archive (DLQ via pgmq's archive table), structured logging, and Sentry capture.
  - A registry that maps job name → queue name → handler.

**Retry policy:**
- Default curve: `30s / 2m / 10m / 1h / 6h`, max 5 attempts (~7.5h before archive). Bias: fast initial retries catch transient blips; long tail gives external systems time to recover.
- Per-job override: `defineJob({ ..., retry: { schedule: [...], maxAttempts: N } })`. Email-style jobs should DLQ within ~1h; external-API-dependent jobs can extend to days.
- Implementation: backoff = re-enqueue with delayed visibility (pgmq supports this directly). Attempt count read from pgmq's `read_ct`.
- Python side: `services/worker-py` mirrors the runner contract using `tembo-pgmq-python` + Pydantic schemas generated from the TS Zod types (JSON Schema → datamodel-code-generator).

**Why:** pgmq is a first-class Supabase feature, language-neutral (works for both Node and Python workers using the same queue — Graphile Worker / pg-boss are Node-only runners and would force a separate queue for Python), and composes with `pg_cron`, RLS, and DB triggers. The cost is writing our own thin runner layer; the benefit is one substrate for everything, with dashboard visibility inside Supabase.

**Tradeoffs:**
- **More glue code than a full job runner.** Graphile Worker would ship retry/backoff/cron config-driven; with pgmq we encode that policy ourselves in `packages/jobs`. ~200 lines of TS + a mirrored Python module. Tolerable, and keeps the runner aligned with our needs.
- **Younger ecosystem than Graphile Worker.** pgmq is solid (SQS-style semantics, well-understood) but has less community tooling. Mitigation: keep our wrapper's API narrow so we could swap the substrate (e.g., to SQS) without touching producers/consumers.
- **Postgres-backed queues hit a ceiling eventually.** Same as before — far beyond template needs. Migration path: swap implementation behind the `packages/jobs` interface.
- **Workers need direct DB access** for `pgmq.read`/`delete`. Service-role key lives in Railway env vars. Standard practice; rotate on a schedule. Consider scoping with a dedicated role that only has access to the queue schema + the specific tables each job needs.
- **Cross-language schema drift risk.** TS and Python both define the payload schema. Mitigation: TS Zod is the source of truth; Python schemas are generated in CI, not hand-written.

---

## 7. Non-Vercel services hosting

**Decision:** Railway for both `services/worker-node` and `services/worker-py`.

**Why:** Simple Dockerfile-based deploys, good DX, pairs well with Vercel + Supabase. Cheap to start, no need to learn k8s or write Terraform for a template.

**Python dependency management:** `uv` for `services/worker-py`. Single fast tool for resolution, locking (`uv.lock`), and venv management; no Poetry/pip-tools split. Dockerfile uses `uv sync --frozen` for reproducible builds.

**Tradeoffs:**
- Railway is a smaller vendor than GCP/AWS; reliability has been good but worth monitoring. Migration path is easy because both services are Dockerized — they can move to Fly.io or Cloud Run with config-only changes.
- Egress costs are predictable but not free; mind the traffic between Railway ↔ Supabase (both have generous free tiers but production-scale traffic adds up).
- `uv` is young (Astral, same folks as Ruff). API has stabilized but worth pinning the `uv` version in CI and the Dockerfile to avoid surprise behavior changes.

---

## 8. Built-in features

**Decisions:**
- **UI:** shadcn/ui + Tailwind. Components copied into `packages/ui`, not installed from npm — standard shadcn pattern.
- **Email:** Resend + React Email. Templates live in `packages/email`.
- **Observability (application layer):** Sentry for error tracking in all three runtimes (Next.js apps, Node worker, Python worker). Sentry consumes OpenTelemetry spans, so application errors and traces share IDs with the log-correlation story in §15. *Operational observability* (structured logs, log transport, trace propagation) lives in §15.
- **Product analytics:** PostHog Cloud. Client-side autocapture in `apps/web` plus server-side event tracking from API routes and workers. (Self-hosted is not planned; if data residency becomes a requirement later, PostHog supports migration.)

**Why:** These are the default picks for a modern SaaS template. shadcn/ui in particular sets the bar for component DX without coupling to a heavyweight design system.

**Tradeoffs:**
- Sentry across three runtimes means three SDK installs and three DSNs. The cost is upfront config; the payoff is unified release tracking.

---

## 9. Billing

**Decision:** Provider-agnostic billing layer in `packages/billing`, with **charging** and **tax-document emission** modeled as two separate concerns. The template ships the abstractions plus **one reference charging adapter (Stripe)** and **zero emitter adapters**. Country-specific providers (Fintoc, Webpay, Openfactura, Bsale, etc.) are implemented in derived projects against the template's interfaces.

**Architecture:**

*Charging side:*
- `packages/billing` exports a provider-neutral domain model: `Customer`, `Subscription`, `Plan`, `Price`, `Invoice`, `PaymentMethod`, `UsageEvent`, and lifecycle events (`subscription.created`, `subscription.updated`, `subscription.canceled`, `invoice.paid`, `invoice.failed`, ...).
- A `BillingProvider` interface defines the operations: `createCheckoutSession`, `createCustomerPortalSession`, `getSubscription`, `cancelSubscription`, `reportUsage`, `verifyWebhook`, `normalizeWebhookEvent` (→ canonical domain event).
- Concrete adapters live in `packages/billing/providers/*`. The template ships `providers/stripe` as the reference; derived projects add their own (`providers/fintoc`, `providers/webpay`, ...) without modifying the package.
- A **provider registry + router** selects which provider to use per call. Routing inputs include: the org's region/country, the rail type (bank transfer vs. card), the org's currently-attached provider account, an explicit override, or a feature flag. An org carries a `billing_accounts` table (one row per provider) so a single org can be connected to multiple providers simultaneously.
- Webhook ingress: one webhook route per provider (e.g., `/api/webhooks/billing/stripe`). Each route delegates to its adapter for verification and normalization, then emits the canonical event onto a single internal handler — business logic (granting entitlements, updating org state) is written once.

*Tax-document side (separate from charging):*
- `Invoice` (our internal billing record) is **distinct** from `TaxDocument` (the legal e-invoice — boleta/factura in Chile, NF-e in Brazil, GST invoice in India, etc.).
- An `EmitterProvider` interface handles tax-document emission: `emit`, `void`, `getStatus`. **No concrete emitter ships in the template** — derived projects add what their jurisdiction needs.
- The canonical `billing.invoice.paid` event triggers emission as a separate step. Charging adapter and emitter adapter are independently swappable.
- `TaxDocument` rows in our DB carry the legal document reference (folio/number), document type, status, and a link to the `Invoice` they belong to. The schema and event flow are template-level; the actual emission is product-level.
- If a derived product is in a jurisdiction without e-invoicing mandates (e.g., US-only), it simply doesn't register an emitter — the seam exists but is unused, costing nothing.

*Entitlements:*
- `plans` and `entitlements` tables live in our DB. Provider price IDs map *to* our internal plan IDs, not the reverse. This is what makes multi-provider feasible — a "Pro" plan is one row in our DB, with potentially many provider-specific price mappings.

**Why ship Stripe (and only Stripe) as the reference charging adapter:**
- It's the most universally-applicable charging provider; almost every derived product can use it for at least international/card payments.
- It has the best sandbox/test mode, which is what makes integration tests of the abstraction actually useful.
- It serves as the blueprint a derived project copies when implementing Fintoc, Webpay, Paddle, etc.
- It validates that the interface generalizes beyond a single vendor *before* derived projects start depending on it.

**Why no emitter ships in the template:**
- E-invoicing is jurisdiction-specific by definition. Even Openfactura — the likely first pick for Chilean derivatives — is the wrong default for a Brazilian or Mexican project.
- The `EmitterProvider` interface is ~30 lines. Once a derived project picks its jurisdiction, wiring an emitter against the interface is a day's work, not a week's.

**Stability marker:**
- `packages/billing` is versioned `0.x.y` until the first derived project ships a second non-Stripe adapter (at which point Stripe-shaped assumptions in the interface will surface and the interface will be refactored).
- A `packages/billing/STABILITY.md` documents the policy. The package README warns derived projects to pin exact versions.
- After the first second-adapter refactor, bump to `1.0` and follow semver.

**Tradeoffs:**
- **Abstractions leak.** Providers diverge on proration, trials, tax handling, and metered billing semantics. The canonical model picks a lowest-common-denominator for core flows and exposes provider-specific extensions via a typed `providerMetadata` escape hatch for advanced features.
- **The interface is only as good as the adapters that exercise it.** With just Stripe in the template, there's a real risk the abstraction encodes Stripe assumptions invisibly. Mitigation: when the *first* derived project adds its second adapter (likely Fintoc), expect to refactor the interface — and treat that as the moment the abstraction is actually validated. Don't lock the interface as stable until then.
- **Conformance test suite ships in the template.** Each adapter (in the template or in a derived project) implements the same conformance suite. This is what keeps "fast to add a new adapter" true; without it, each new adapter is a discovery exercise.
- **Tax handling is provider-shaped.** Stripe is not a Merchant of Record (Stripe Tax helps but isn't MoR). The `EmitterProvider` layer is how derived products in jurisdictions with mandated e-invoicing close that gap.
- **"Charge succeeded, tax document failed" is a real and legally-fraught state** that any e-invoicing jurisdiction will hit. The template's job-queue integration (§6) handles emission retries durably with high max-attempts; the template ships a generic "needs manual intervention" admin view in `apps/admin` parameterized on `TaxDocument.status`, so derived products inherit the recovery UX for free.

---

## 10. Testing & CI

**Decision:** Vitest (unit/integration) + Playwright (E2E) + GitHub Actions, with Turborepo remote cache.

**Specifics:**
- **RLS test suite:** dedicated suite in `packages/db` that spins up a local Supabase, seeds multi-tenant data, and asserts cross-tenant queries fail. This is the single highest-leverage test the template can ship.
- **Type-check + lint + unit** on every PR; **E2E + RLS** on `main` and release branches.
- Worker services have their own unit tests (Vitest for Node, pytest for Python).

**Why:** Catches the failure modes that actually bite SaaS apps — tenant leakage, broken auth flows, regressed checkout. Heavier than "ship lean," lighter than "reference-quality."

**Tradeoffs:**
- Playwright E2E adds CI time and flake surface. Mitigation: keep the E2E suite small (golden paths only) and rely on Vitest for breadth.

---

## 11. Database tooling

**Decision:** Supabase CLI for migrations; **hybrid** query layer. `supabase-js` in `apps/web` (user-context, RLS-honoring), Drizzle with a service-role Postgres connection in `apps/admin` and `services/*` (cross-tenant, complex queries). Types generated from the live schema via `supabase gen types`.

**`packages/db` shape:**
- Exports two named factories — **`getUserClient(req)`** and **`getServiceClient()`** — so the security boundary is visible at every call site.
- An ESLint rule forbids importing `getServiceClient` from `apps/web/**`. Bypassing RLS in the client app is a tooling-level error, not a code-review hope.
- Both clients consume the same generated `database.types.ts` (produced by `supabase gen types --linked`). Drizzle's schema is introspected from the live DB (`drizzle-kit introspect`), so the DB remains the single source of truth and TS types stay aligned across both clients.
- A CI check runs `supabase gen types` + `drizzle-kit introspect` and fails if either drifts from what's committed.

**Migrations:**
- `supabase migration new <name>` → raw SQL files under `supabase/migrations/`. Applied via `supabase db push` (remote) or `supabase db reset` (local).
- RLS policies, Postgres extensions (pgmq, pg_cron), functions, and seed data all live in migration files. This is what drizzle-kit can't natively do, and why the migration tool isn't where we wanted Drizzle anyway.
- Type generation is a post-migration step in CI: after applying a migration to a preview DB, regenerate types and fail if `database.types.ts` doesn't match.

**Why:**
- Honoring RLS structurally (not by convention) is the highest-leverage decision in this whole stack. `supabase-js` makes RLS the default path in `apps/web`; switching to the service-role client requires importing a different factory whose name says what it does.
- Admin and worker queries are legitimately cross-tenant and legitimately complex — using `supabase-js` for them would push call sites into raw RPCs or PostgREST contortions. Drizzle is the right tool for that surface.
- Supabase CLI is the only migration tool that handles the full surface (RLS, extensions, functions, seed). Drizzle-kit can do plain DDL but you'd be using both anyway; cleaner to pick one.

**Tradeoffs:**
- **Two clients to maintain.** Engineers need to know which to use where. Mitigated by the linter rule and by the factory names — but it's a real cognitive cost.
- **Connection management splits.** `apps/web` connections go through PostgREST (Supabase handles pooling). Admin/worker Drizzle connections need a Postgres connection pool (PgBouncer / Supabase's transaction-mode pooler). Two pool stories instead of one.
- **Schema drift risk between the two TS type sources.** Mitigated by the CI check, but it's a thing to keep paying attention to.
- **Type generation is a step.** Forgetting to regenerate types after a migration is a likely paper-cut. The CI gate catches it before merge; local DX is a regen npm script run by a Supabase CLI post-migration hook.
- **No schema-as-code.** Schema lives in SQL migrations, not TS. People used to Prisma/Drizzle DSL will miss it. Accepted: SQL is the lingua franca with Supabase, and RLS policies are SQL anyway.

---

## 12. Local development workflow

**Decision:** Supabase CLI for the backend stack + native processes for apps/workers, orchestrated by Turborepo. Canonical seed data in `supabase/seed.sql`. Outbound email in dev is routed through Supabase's bundled **InBucket** SMTP catcher via a dev-only `SmtpProvider` adapter in `packages/email`.

**Prerequisites on a dev machine:**
- Docker (for the Supabase local stack).
- Node + pnpm (apps and Node worker).
- Python + `uv` (Python worker, per §7).
- Stripe CLI (for webhook forwarding to localhost during billing dev).

**Run commands:**
- `pnpm setup` (canonical entry point, idempotent): installs deps; runs `supabase start`; applies migrations; runs `supabase/seed.sql`; generates DB types (§11); writes per-surface `.env.local` files by combining `supabase status` output (auto-generated local Supabase creds) with prompts from `.env.example` for external sandbox keys (Stripe test, PostHog dev, etc., per §13). Re-running won't overwrite existing values but surfaces newly-required vars added to any `packages/env` schema.
- `pnpm dev`: `turbo run dev` runs `apps/web`, `apps/admin`, `services/worker-node` (tsx watch), and `services/worker-py` (uv + watchfiles) in parallel. Supabase stays up across reloads.
- `pnpm dev:webhooks`: `stripe listen --forward-to localhost:3000/api/webhooks/billing/stripe`. Documented as a separate task because it requires a Stripe CLI login.
- `pnpm db:reset`: `supabase db reset` (drops, re-applies migrations, re-seeds). Standard "clean slate" when a migration goes sideways.
- `pnpm db:types`: regenerates `database.types.ts` from the live local schema (per §11).

**Seed data (`supabase/seed.sql`):**
- 1 admin user (in `admin_users`).
- 1 regular user.
- 1 org with both users as members.
- 1 example plan + entitlement record.
- 1 example queued job (so the workers visibly do work right after `pnpm dev`).
- Deliberately small: enough to exercise auth, org/membership, billing, and the job queue end-to-end. Not a fixture buffet.

**Email in dev:**
- `packages/email` exports a provider interface; the `ResendProvider` is used in prod, an `SmtpProvider` pointing at InBucket (host: `localhost`, port: from `supabase status`) is used in dev. Adapter is selected by `NODE_ENV` / a `MAIL_PROVIDER` env var.
- InBucket's web UI (also surfaced by `supabase status`) shows sent emails with HTML preview. Real-feeling DX without an external service.

**Other services in dev:**
- **Sentry:** init guarded by `NODE_ENV === 'production'`. No DSN needed locally.
- **PostHog:** a dev project ID is acceptable; alternatively, the client is no-op'd in dev to keep analytics dashboards clean. `POSTHOG_KEY` absent → no-op.
- **Stripe:** sandbox keys + `stripe listen` per the `pnpm dev:webhooks` task above.

**Why:**
- Next.js HMR and worker tsx-watch reload are dramatically faster running natively than through a bind-mounted Docker volume on macOS. Engineers spend most iteration time in apps/workers, so they get the fast path.
- Supabase CLI's local stack gives us **real Postgres with pgmq, pg_cron, and RLS** — the exact failure surface as prod. Anything mocked here would defeat §10's RLS test suite and the §6 queue runner.
- Seed data lives in SQL because the schema lives in SQL (§11). One language, one place. RLS tests use the same seed by re-running it through Supabase's test helpers — no parallel factory layer to maintain.
- InBucket is already running in the Supabase local stack; piggy-backing on it costs nothing and gives a better DX than stdout logs or a custom dev table.

**Tradeoffs:**
- **Multi-runtime toolchain on the dev machine.** Docker + Node + pnpm + Python + uv + Stripe CLI is a lot to bootstrap. `pnpm setup` covers most of it but the prerequisites are real. Acceptable for a SaaS template; non-negotiable for what we're building.
- **`supabase start` takes ~30s the first time.** Subsequent starts are faster, but the first-time experience is slow. Documented in the README; not worth working around.
- **Turborepo `dev` task output gets noisy** with four parallel processes. Engineers who care can layer `mprocs` on top; not shipping it in the template by default.
- **No factory-based seeding shipped.** If a derived project needs richer test fixtures, they add a TS factory layer for tests. The template doesn't ship one because §10's RLS suite uses the same seed.sql; YAGNI until a derived project hits the wall.
- **Email dev adapter is a small piece of code the template carries** that prod will never use. Cost is ~50 lines; benefit is that every derived project's email development "just works."

---

## 13. Env & secrets management

**Decision:** Native platform envs (Vercel + Railway + GitHub Actions) as the source of truth per platform. Schema centralized in **`packages/env`** with per-surface Zod schemas, validated at boot. Rotation handled by a runbook in `docs/recipes/secret-rotation.md`. Centralization tools (Doppler, Infisical, 1Password) are recipes, not baked-in defaults.

**Why native envs as default:**
- Matches §0: no secrets-manager vendor in the template. Derived projects layer Doppler / Infisical / 1P on top when their team outgrows native envs.
- Local dev secrets are mostly auto-generated by `supabase start` (per §12). Sandbox keys for external services come from `.env.example` + per-service instructions in the README.
- No new tool prerequisite for contributors (the Doppler/Infisical/1P CLIs would all be one more thing to install).

**`packages/env`:**
- One Zod schema per surface: `apps/web`, `apps/admin`, `services/worker-node`, `services/worker-py`. Each exports a typed `env` object.
- Schemas are split by **server / client / shared** within each surface — `apps/web/env.client.ts` cannot reference `SUPABASE_SERVICE_ROLE_KEY` even by accident, because the client schema doesn't include it. Reuses the `@t3-oss/env-nextjs` pattern.
- Boot-time validation: any missing/malformed env crashes the app on startup with a readable error, not at the first usage site. Means deploy failures, not surprise 500s in production.
- `.env.example` files are **generated** from the schemas (script: `pnpm env:example`). Drift between the validator and the example is impossible because the example doesn't exist by hand.
- Shared secrets (Supabase URL, service-role key, Sentry DSN) are defined once in a `packages/env/shared.ts` Zod definition and composed into each surface's schema. Adding a new shared secret is a one-place change.

**Local dev:** Bootstrapping of `.env.local` files is owned by `pnpm setup` (canonical description in §12). `packages/env` participates by exposing each surface's schema so the script knows which vars to prompt for and validate; new vars added to a schema surface automatically on the next `pnpm setup` run.

**Deploy:**
- Vercel envs managed in each project's dashboard. Same for Railway.
- GitHub Actions secrets managed in the repo settings.
- No template-shipped script syncs across platforms — that's where Doppler-class tools become valuable. The recipe explains the upgrade path.

**Rotation runbook (`docs/recipes/secret-rotation.md`):**
- Per high-value secret (Supabase service-role, Stripe webhook secret, Resend API key, etc.): a checklist of where it lives (which Vercel projects, which Railway services, GH Actions, local `.env.local`), the rotation procedure on the source platform, and the order of updates that minimizes downtime.
- Recipe form, not automation. A `pnpm secrets:audit` script was considered and skipped — it adds complexity for derived projects that may never use it.

**Centralization recipes (`docs/recipes/`):**
- `secrets-doppler.md` — Doppler integration with Vercel + Railway, including local dev via `doppler run`.
- `secrets-infisical.md` — same shape, self-host path documented.
- `secrets-1password.md` — local-only via `op://` refs in `.env`, with notes on what's still manual at the deploy layer.

**Tradeoffs:**
- **Drift between platforms is a real risk under the native-envs default.** Same key in five places, no centralized source. This is the explicit reason Doppler/Infisical exist; the template's posture is "make the upgrade easy, don't ship it." For a small team this is fine; once a team adds a third contributor or starts rotating secrets monthly, expect the recipe to be exercised.
- **Boot-time validation can mask the real failure** when a secret rotation lands partial — e.g., service rolled but Stripe key didn't, both services boot fine but billing is broken. Schema validation doesn't help here. Mitigation: the rotation runbook orders updates to avoid this; longer-term mitigation is centralization.
- **Each surface has its own env schema.** Means duplicate boilerplate at the per-surface level (the import of the shared schema, the surface-specific additions). Acceptable: the alternative is a single mega-schema with conditional optionality, which is harder to read and harder to validate at boot.
- **`.env.example` regeneration is one more thing to remember.** Mitigated by a pre-commit hook (or CI check) that fails if `.env.example` is out of sync with the schema. Worth shipping the CI check.

---

## 14. Feature flags

**Decision:** `packages/flags` exports an OpenFeature client. Reference provider is PostHog (per §8). Plan entitlements stay in `packages/billing` (per §9) and are structurally separate from flags. Local/dev overrides supported via three layers: env-var, URL parameter, and an admin UI override in `apps/admin`.

**Architecture:**

*Abstraction:*
- OpenFeature SDK is the call-site API. App code calls `flags.getBooleanValue('new_billing', false, evalCtx)` — provider is irrelevant to callers.
- `packages/flags` ships the OpenFeature client setup and a **PostHog provider adapter** as the reference. Derived projects can swap providers (LaunchDarkly, Statsig, env-only) by registering a different OpenFeature provider — no call-site changes.
- Targeting context (`evalCtx`) carries both `userId` and `orgId` (plus tenant-level attributes). PostHog group targeting on `orgId` lets us release to specific customers.

*Evaluation:*
- **Server-side primary.** Flags are evaluated in Next.js Server Components or route handlers; results are bootstrapped into client components so there's no hydration flash.
- **Client-side eval available** for client-only flows (e.g., experiments where the bucket changes per interaction). Client SDK is initialized with the bootstrapped values to avoid the first-eval network call.
- Workers (`services/*`) evaluate server-side with worker-context (`userId`/`orgId` from the job payload).

*Overrides (dev / QA / staging):*
- **Env-var override** — `FF_OVERRIDE_<flag_name>=true|false|<json>`. Loaded by the flags client at boot. Highest precedence. Use case: local dev, CI test runs.
- **URL parameter override** — `?ff_<flag_name>=true`. Cookie-stored after first set. Use case: quick QA on any environment. Disabled in production by an env var (overrides remain available in staging/dev).
- **Admin UI override** — `apps/admin` ships a flag-override view that forces a flag state for a specific user or org. Persists in DB (`flag_overrides` table), audited via `admin_audit_log` (per §5). Use case: pinning a specific customer to a feature state for support, demos, or incident response.
- Precedence order at eval time: admin-UI > env-var > URL > provider value > default.

*Separation from entitlements:*
- **Entitlements** = "this org has paid for or been granted access to feature X." Authoritative grant tied to billing state, lives in `packages/billing` (§9). Mistoggling here = legal/contractual issue.
- **Flags** = "is feature X enabled for this caller right now (rollout %, experiment bucket, kill switch)." Lives in `packages/flags`. Mistoggling here = a UX bug.
- A typical gated feature checks both: `if (entitlements.has('pro') && flags.isOn('new_dashboard')) { ... }`. Helper in `packages/flags` makes this composition explicit and lintable.
- This structural split prevents the common mistake of using flags as paywall (a flag mistoggle silently giving away paid features) or using entitlements as rollout control (a billing event being the thing that ships a feature).

**Why OpenFeature instead of a custom wrapper:**
- It already exists, is maintained by CNCF, and has provider adapters for almost every vendor we'd ever consider. Saves us designing and maintaining the interface.
- The API surface we actually use (`getBooleanValue`, `getStringValue`) is small even though the spec is broader — we ignore the parts we don't need.
- Swap-out path is real (provider adapters exist for LaunchDarkly, Statsig, Flagsmith, env-var, GrowthBook, ConfigCat, etc.), not theoretical.

**Tradeoffs:**
- **OpenFeature is one more SDK with its own concepts** (hooks, evaluators, providers). Most engineers haven't used it. README + a few usage examples cover the gap; the actual surface area we use is small.
- **Three override layers is more machinery than env-var alone.** The admin UI override is the most complex piece (DB table, admin route, audit log entry). It's the highest-value layer for production support, so worth shipping — but it's optional for derived projects that don't need it on day one. Code is wired but the admin route can be hidden via a flag.
- **PostHog flag evaluation has latency considerations.** Local evaluation via the Node SDK (downloads flag config periodically) is the right pattern for the workers and server-side eval; client-side relies on bootstrap to avoid the network hop. Documented in the package README.
- **Group targeting in PostHog requires `groupIdentify`** calls for orgs — easy to forget. The auth helpers in `packages/auth` make this automatic when a user authenticates with an active org context, so flag eval against `orgId` works out of the box.
- **Override precedence has a security surface.** URL-param override in production is a footgun if a staff user shares a link with a customer. The env-var gate that disables URL overrides in production is mandatory; admin-UI overrides remain auditable.

---

## 15. Operational observability

**Decision:** `packages/observability` ships logger setup (Pino + structlog), standard structured fields, and **OpenTelemetry**-based trace context propagation across all surfaces. Default log transport is **JSON to stdout**; the template is vendor-neutral and ships connection recipes for Better Stack, Axiom, Grafana Cloud, and Datadog. Uptime, status pages, and on-call rotation are out of template scope.

**Scope boundary:**
- *In scope:* structured logging, log-field conventions, trace correlation, request/job context propagation, recipes for shipping logs to aggregators.
- *Out of scope:* uptime synthetic checks, public status pages, on-call rotation tooling. These are product-org decisions (a solo founder doesn't need on-call rotation; a 10-person company does) and shouldn't be baked into the template. Derived projects can add Better Stack / Pingdom / Statuspage / PagerDuty etc. as their team grows. The template's job is to make the logs they consume rich enough to be useful.

**Logger config (`packages/observability`):**
- **Node side:** Pino preconfigured with standard fields, JSON output, async destination.
- **Python side:** structlog preconfigured with matching field names and JSON output (worker-py emits the same shape).
- **Standard fields on every log line:**
  - `service` — `web` / `admin` / `worker-node` / `worker-py`
  - `env` — `production` / `staging` / `dev`
  - `request_id` — for HTTP requests
  - `job_id` — for queue jobs
  - `org_id`, `user_id` — when authenticated
  - `trace_id`, `span_id` — from OpenTelemetry context (see below)
  - `release` — Git SHA, populated at build time
- **Context propagation:** `withContext()` helper in TS, `bind_contextvars()` pattern in Python. Once context is set at the boundary (request handler, job consumer), every subsequent log line in that scope carries the context fields.
- **PII rules:** logger ships with a redactor configured for known sensitive fields (`password`, `token`, `secret`, `authorization`, `cookie`). Documented as a starting point — derived projects add domain-specific redactions.

**Trace correlation via OpenTelemetry:**
- OTel SDK initialized in Node (`@opentelemetry/sdk-node`) and Python (`opentelemetry-sdk`) in each surface. Provides `trace_id`/`span_id` to the logger via context propagation.
- **Sentry consumes OTel spans** (Sentry SDK has first-class OTel support as of 2024). Means we get Sentry's transaction view *and* portable OTel traces — no double instrumentation.
- Across the job queue boundary: trace context is **serialized into the job payload** by the producer (Next.js enqueue) and **restored by the consumer** (`services/worker-*`) so a single trace spans request → enqueue → consume. Implemented in `packages/jobs` as part of `defineJob`/`runWorker`.
- Across the HTTP boundary: standard W3C `traceparent`/`tracestate` headers; works natively with Next.js + supabase-js + fetch.

**Default transport (stdout):**
- All surfaces emit JSON to stdout. Vercel and Railway both surface stdout in their dashboards (short retention) and both have log-drain integrations to external aggregators.
- No daemon, no sidecar, no buffer to manage. Universal lowest common denominator.

**Connection recipes (`docs/recipes/observability-*.md`):**
- `observability-betterstack.md` — Better Stack integration (Vercel log drain + Railway integration + dashboard setup). Genuinely useful free tier; covers more than logs if a team eventually wants it.
- `observability-axiom.md` — Axiom (best Vercel integration, generous free tier, focused on logs/events).
- `observability-grafana-cloud.md` — Loki/Tempo via Grafana Cloud; OSS-friendly, self-host escape hatch.
- `observability-datadog.md` — for teams already on Datadog at the org level.

**Why vendor-neutral by default:**
- Logging destination is a deploy-time choice, not a code-time one. Pino/structlog emit the same JSON regardless of where it goes. Per §0, baking a vendor in adds weight every derived project carries (account setup, env vars, SDK install) for a decision they may make differently.
- The valuable, hard-to-add-later parts are the **field conventions** (`org_id`, `trace_id`, etc.) and the **trace propagation across the job boundary**. Those ship in the template. The destination is plumbing.

**Why OpenTelemetry over Sentry-only trace context:**
- Sentry's trace IDs propagate cleanly inside Sentry's tooling, but they're not a portable standard — a log aggregator joining on `trace_id` only works if Sentry's IDs are usable as keys.
- OTel uses W3C trace context (`traceparent` header) — works in every modern log aggregator, every APM tool, and through HTTP boundaries without bespoke code.
- Sentry consumes OTel spans natively, so we lose nothing on the Sentry side.
- Modest upfront cost (OTel SDK init in each surface) for substantially better portability and cross-tool correlation.

**Tradeoffs:**
- **stdout default + no aggregator = no cross-surface log search.** A derived project that ships to production without picking an aggregator is essentially blind beyond Vercel's/Railway's tiny retention windows. The recipes are mandatory reading, not optional. README states this explicitly.
- **OTel adds setup code in every surface.** Two SDKs (Node + Python), an init module per surface, context propagation wiring across the job queue. Maybe ~100 lines of plumbing total. Worth it for the portability.
- **PII redactor is a starting point, not a complete solution.** Derived projects in regulated jurisdictions (healthcare, finance) need their own data-classification pass on what fields can be logged. Template can't presume.
- **`apps/web` server-side logs are easy; `apps/web` client-side logging is harder.** Browser logs don't go to stdout. The template doesn't ship a browser-log transport — Sentry's browser SDK captures errors, and PostHog captures behavior; raw browser console logs are not aggregated. Acceptable tradeoff: derived projects that need client-log aggregation add it.
- **Trace propagation across pgmq is custom code** (header serialization into the job payload). Documented and tested but a known weak point — any third party that processes the queue without going through `runWorker` would break trace continuity.

---

## 16. Things explicitly NOT in scope (yet)

- Mobile clients (React Native / Expo).
- Internationalization beyond English copy.
- A design-token system beyond Tailwind defaults.
- Self-hosted deployment recipes.
- Provider-specific advanced billing features that don't generalize (e.g., Stripe Sigma, Paddle Retain) — addressable via the `providerMetadata` escape hatch in §9 if needed, but not first-class in the abstraction.
- Country-specific billing adapters (Fintoc, Webpay, Openfactura, Bsale, etc.) — implemented in derived projects against the template's `BillingProvider` / `EmitterProvider` interfaces. The template ships only Stripe as the reference (see §9 and §0).

Calling these out so they don't sneak in as "while we're at it" work.

---

## 17. API boundary pattern

**Decision:** Hybrid. **Server Actions** for mutations in `apps/web` and `apps/admin`. **Route Handlers** for inbound webhooks, cron-triggered endpoints, and any cross-origin or public API surface. **No tRPC.**

**Why:**
- Server Actions are App Router-native, integrate with RSC, handle forms cleanly, and give end-to-end type safety via TS inference.
- Webhooks need Route Handlers for raw-body signature verification (§9), and public APIs need standard HTTP semantics Server Actions don't expose.
- tRPC's value proposition (type-safe RPC) is subsumed by Server Actions + RSC in App Router. Adding it is duplicate machinery in 2026.

**Tradeoffs:**
- Server Actions are still maturing — error boundaries, optimistic UI patterns, and progressive enhancement have rough edges. Acceptable; the App Router bet in §1 already accepts this.
- Public API path requires a separate decision when needed: OpenAPI-described Route Handlers, or a thin adapter. Not premature now. Related to C6 (CORS) when it lands.

**Related:** §1, §3.

---

## 18. Environments topology

**Decision:** Two Supabase projects — **prod** and **dev-shared**. No per-PR DB branching by default (free-plan-compatible). Migration safety enforced in CI via local Supabase (`supabase start` in GitHub Actions).

**Architecture:**
- **dev-shared** receives merged migrations via a CI step on push to `main`. It's never branched. Vercel previews bind to dev-shared; PRs with unmerged migrations get a banner noting "preview reflects pre-migration schema."
- **CI per PR:** spin up local Supabase in the runner, apply the PR's migrations, run the RLS suite (§10) + a smoke test. This is the load-bearing safety net — no Supabase paid features needed.
- **Manual promote path:** `pnpm supabase:promote-pr` script applies a PR's migration set to dev-shared for authors who need it live before merge. Small-team-coordinated; documented as "announce before running."

**Why:**
- Free-plan compatibility is a template-level constraint; DB branching is a paid feature.
- The RLS suite (§10) already needs local Supabase in CI. Extending it to migration validation per PR adds zero new infra cost.
- Three projects with a dedicated staging is weight derived projects pay for a use case many won't have. Better as a recipe; see below.

**Tradeoffs:**
- Open PRs share dev-shared row state — can collide. Acceptable at template scale.
- PR previews don't reflect unmerged schema changes. Documented limitation; CI catches the migration safety story regardless.

**Recipes:**
- `docs/recipes/db-branching.md` — when to upgrade to Supabase branching (team >2-3 active PRs, migration-heavy schemas), CI integration, cost ballpark.
- `docs/recipes/staging-environment.md` — when to add a third Supabase project + Vercel/Railway envs (3+ contributors, external integrations needing a stable non-prod URL, compliance UAT).

**Related:** §10, §11, §12.

---

## 19. DB schema conventions

**Decision:**
- **Primary keys: UUID v7**, generated via a `uuid_generate_v7()` SQL function (or `gen_random_uuid()` if Supabase's PG version supports v7 natively at scaffold time — verify before locking).
- **PK naming: `<table_singular>_id`** — `organizations.organization_id`, `profiles.user_id` (1:1 with `auth.users`, see §21), etc. Enables `JOIN ... USING (organization_id)` throughout the tenant-scoped surface.
- **Junction tables (e.g., `memberships`):** surrogate `<junction>_id` PK + unique constraint on the natural key (e.g., unique `(user_id, organization_id)`). Surrogate is friendlier for audit-log references and role-change history.
- **`created_at` + `updated_at`** on every table. `DEFAULT now()` + the `moddatetime` Postgres contrib extension (`create extension if not exists moddatetime;`, then per-table `before update ... execute procedure moddatetime(updated_at);`). No custom trigger function.
- **Soft delete: column-based (`deleted_at timestamptz null`), opt-in per table.** Not defaulted everywhere. Only on entities with restore/audit requirements (users, orgs).
- **Naming: plural snake_case** for tables (`organizations`, `memberships`). No domain prefixes; use Postgres schemas if separation becomes needed later.

**Why:**
- UUID v7 is monotonic → b-tree-friendly, fewer page splits, no row-count leakage. v4 fallback available.
- `<table_singular>_id` + `USING` joins remove a huge amount of boilerplate in a codebase that joins on `organization_id` constantly.
- `moddatetime` is a battle-tested Postgres contrib module; writing a custom `set_updated_at()` is overkill.
- Opt-in soft delete keeps RLS policies, indexes, and queries simple by default.

**Tradeoffs:**
- `<table_singular>_id` breaks the implicit ORM convention that PKs are named `id`. Drizzle and supabase-js are both flexible; configured explicitly per table.
- Surrogate PKs on junction tables cost one extra index. Negligible.
- UUID v7 native support depends on Supabase's PG version — verify before scaffolding. Fallback: `gen_random_uuid()` (v4) with a planned upgrade migration.

**Related:** §4, §11.

---

## 20. Migration deploy order & rollback model

**Decision:** **Forward-only, expand-then-contract migrations. DB migrations applied before code in every deploy.**

**Mechanics:**
- Forward-only: never write down-migrations. Reverting a bad migration = a new compensating forward migration.
- Breaking changes follow the expand-then-contract sequence: (1) expand — add new column/table backward-compatible, (2) deploy code that dual-reads, (3) backfill, (4) deploy code that reads only new, (5) contract — drop old.
- CI gate: prod migrations applied via a dedicated workflow step *before* Vercel and Railway deploys are triggered. Migration failure blocks the deploy.
- Documented in `docs/recipes/migration-patterns.md` with worked examples (add NOT NULL column, rename column, drop column, change FK).

**Why:**
- Forward-only matches §11's "SQL is the source of truth" posture.
- Expand-then-contract is the only safe pattern when `apps/web`, `apps/admin`, and the Railway workers deploy on independent cadences and a column might be in-flight across them.
- DB-first deploy ordering means apps and workers always boot against a schema at or ahead of what the code expects.

**Tradeoffs:**
- Multi-step migrations mean every breaking change spans multiple PRs and deploys. Slower than "one PR, one deploy"; far faster than recovery time when a single-shot migration breaks production.
- Forward-only means no automated rollback. Mitigation: small migrations, and the contract step lands days/weeks after expand so reverting is rarely a hot-path concern.
- Dual-read code is temporary debt. The recipe includes a contract-phase checklist to make sure it actually gets cleaned up.

**Related:** §7, §10, §11.

---

## 21. Onboarding & invitation flows

**Decision:** Ship wired flows. `profiles` table 1:1 with `auth.users`. Multi-org with login-time picker. Signed-token email invites. Role enum (`owner` / `admin` / `member`) with a central `can(membership, action)` helper.

**Data model:**
- **`profiles`** — PK `user_id` (FK to `auth.users.id`, `ON DELETE CASCADE`). Holds `display_name`, `avatar_url`, `locale`, `timezone`, marketing prefs. Created by a `handle_new_user()` trigger on `auth.users` insert (Supabase's standard pattern — we don't own the `auth` schema).
- **`memberships`** — surrogate `membership_id` PK + unique `(user_id, organization_id)`. `role` column constrained to `owner` / `admin` / `member` via enum or check constraint.
- **`invitations`** — `invitation_id, organization_id, email, role, token_hash, expires_at, accepted_at, invited_by`. 7-day TTL default.

**Flows:**
- **Signup:** email/password → email verification (Supabase-managed) → first login → check membership count.
- **First-login routing:** 0 orgs → "create your first org" screen; 1 org → redirect to that org's dashboard; 2+ orgs → org picker.
- **Invite acceptance:** signed token link → if user exists, login + auto-accept; if not, signup + email-verify + auto-accept. Skips "create your first org" because the user now has one.
- **Active org state:** `active_organization_id` cookie. Middleware in `apps/web` validates the cookie against memberships on every request; mismatch → org picker. RLS still keys on `auth.uid()` + `memberships` (cookie is UI scope, not a security boundary).
- **Org switcher** in the top nav updates the cookie + soft-reload.

**Authorization helper (`packages/auth`):**
- `can(membership, action)` — central lookup table mapping (role, action) → allow/deny.
- Action set is extensible per derived project; the role enum rarely needs extension.
- Reused by middleware, Server Actions, and Route Handlers so the auth decision is in one place.

**No auto-join-by-email-domain** at template level — security footgun by default. Recipe in `docs/recipes/email-domain-orgs.md` for derived projects that want it.

**Why:**
- Onboarding is the single most-modified flow in every derived project, but the *bones* (profile trigger, org creation, invite token shape, email template) are identical. Save derived projects from re-architecting.
- `profiles` separate from `auth.users` is Supabase's recommended pattern.
- Multi-org from day one is far cheaper than retrofitting. Single-org assumptions leak into RLS policies, URL structures, and UI state.

**Tradeoffs:**
- Wired flows are weight every derived project carries even if they restyle. Cost is a 1-2 day re-skin; benefit is they don't re-architect.
- Cookie-based active org adds a middleware hop on every request. Cheap; revisit if it shows in profiles.
- Three roles cover ~80% of products. Apps needing finer-grained permissions (per-resource, custom roles) layer it on top of `can()`.

**Related:** §4, §5, §8.

---

## 22. Entitlements read API

**Decision:** Lives in `packages/billing` as a sub-export — `import { entitlements } from '@template/billing/entitlements'`.

**Signature:**
- `entitlements.has(orgId: string, key: string): Promise<boolean>`
- `entitlements.list(orgId: string): Promise<Entitlement[]>`
- Per-request memoization via Next.js `cache()` wrapper on the server. Workers call directly without the cache wrapper.

**Why:**
- Entitlements are derived from billing state (plans, active subscriptions, manual grants). The source data lives in billing-adjacent tables; a separate `packages/entitlements` would either circular-import or be a thin wrapper.
- Not attached to the Org model: that would pull billing into `packages/db` and expand `packages/db`'s purpose beyond DB access.
- Sub-export (rather than top-level on `packages/billing`) keeps the entitlements API discoverable as its own concept while preserving the package boundary.

**Composition with flags (§14):**
- The composition helper (`if (ents.has('pro') && flags.isOn('new_dashboard'))`) lives in `packages/flags` but accepts the entitlements API by **injection** — `packages/flags` does not import `packages/billing`. Prevents circular deps and keeps flags swappable in isolation.

**Tradeoffs:**
- A derived project swapping the billing package wholesale (unlikely) also swaps entitlements. Acceptable; the API surface is small.
- Per-request cache means an entitlement granted mid-request isn't visible until the next request. Standard read-your-writes consideration; documented.

**Related:** §9, §14.

---

## 23. Rate limiting

**Decision:** Per-tenant token-bucket enforced in **Next.js middleware**, backed by **Upstash Redis** via `@upstash/ratelimit`. One enforcement point, family-keyed buckets.

**Architecture:**
- Two key shapes by default:
  - `auth:<ip>` for unauthenticated routes (signup, login, password reset). Strict (~5/min).
  - `api:<orgId>` for authenticated routes. Generous (~600/min default; per-tenant tier-aware via §22 entitlements).
- Webhooks (Stripe, billing providers) skip rate limiting — signature verification is the protection, and providers expect 200s.
- Per-route overrides via a tiny `withRateLimit({ family, ... })` Route Handler wrapper.
- Edge-runtime-compatible; REST-based so no connection pooling concerns from Vercel functions.

**Why Upstash:**
- Edge-compatible and Vercel-native.
- Free tier covers template workloads.
- `@upstash/ratelimit` no-ops cleanly when keys are absent — local dev works without an Upstash account.

**Tradeoffs:**
- Adds an Upstash account to the prod prereq list. Mitigated by no-op mode locally and by the recipe below for derived projects that don't want another vendor.

**Recipe:**
- `docs/recipes/rate-limit-pgmq.md` — Postgres-backed alternative (atomic counter functions in the same DB). Slower than Redis but vendor-free; appropriate for low-traffic derivatives.

**Related:** §6, §15, §17.

---

## 24. Worker health checks + graceful shutdown

**Decision:** Each worker exposes a tiny `GET /health` endpoint bound by `runWorker` (§6). Railway polls it. SIGTERM triggers a configurable graceful drain.

**Mechanics:**
- **Health endpoint:** returns 200 if (a) DB reachable and (b) last-poll timestamp within a threshold; 503 otherwise.
- **SIGTERM behavior:** `runWorker` stops new `pgmq.read` calls, drains in-flight handlers up to `SHUTDOWN_GRACE_SECONDS` (default 30s), then exits.
- **No job loss:** in-flight jobs that exceed the grace period have their pgmq visibility expire and are retried by another worker. The visibility timeout *is* the safety net.
- **Python parity:** `services/worker-py` mirrors the contract with `asyncio` signal handlers.
- Documented in each worker's README alongside Railway's deploy-timeout guidance.

**Why:**
- Without a health endpoint, Railway can't distinguish a wedged worker from a slow one.
- Without graceful shutdown, every deploy briefly drops in-flight jobs into retry territory, doubling work.

**Tradeoffs:**
- Workers carry a minimal HTTP server they wouldn't otherwise need. ~20 lines per runtime; worth it for the health signal and a place to add metrics later.

**Related:** §6, §7.

---

## 25. Security headers + CSP

**Decision:** Static security headers in **`next.config.js` `headers()`**; **CSP in Next.js middleware** with a per-request nonce. Reporting goes to **Sentry** (§8). Stricter CSP in `apps/admin` than `apps/web`.

**Headers (both apps):**
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()` (extend per product)

**CSP (in middleware, nonce-based):**
- `default-src 'self'`
- `script-src 'self' 'nonce-<x>' <provider-domains>` (e.g., PostHog in `apps/web`)
- `connect-src 'self' <supabase> <posthog> <sentry>`
- No `unsafe-inline` / `unsafe-eval` except where strictly required (documented per exception).
- `report-to` + `report-uri` → Sentry endpoint.

**`apps/admin` differences:**
- No PostHog, no third-party analytics domains in `script-src` / `connect-src`.
- Tighter `frame-ancestors 'none'`. Internal surface; no embedding scenarios.

**Tradeoffs:**
- Strict CSP breaks third-party widgets that inject inline scripts. Each addition (Intercom, Stripe Checkout redirect, etc.) needs an explicit CSP entry. Documented in `docs/recipes/csp-extensions.md`.
- Nonce-based CSP requires middleware to run on every request — already true for §5 (admin) and §14 (URL-param flag overrides), so no incremental cost in `apps/admin`; small extra cost in `apps/web`.

**Related:** §5, §8.

---

## 26. OAuth provider defaults

**Decision:** **Email/password only by default.** OAuth providers (Google, GitHub, Apple) are wired as configuration in `packages/auth` but not enabled.

**Mechanics:**
- `packages/auth` exports a `providers` array; the template ships with `['email']`.
- Enabling `'google'` is: (1) register OAuth credentials in Supabase dashboard, (2) add env vars, (3) flip the array.
- README's onboarding section documents the one-screen setup for Google, GitHub, and Apple.

**Why:**
- Supabase requires the project owner to register OAuth credentials with each provider. Defaulting OAuth on means the template ships broken until those keys are added — worse DX than enabling later.
- Email/password works out of the box, including the `pnpm setup` + InBucket dev flow (§12).

**Tradeoffs:**
- "Modern SaaS expects Google sign-in on day one." Users will have to flip a flag. Accepted; the README calls it out prominently and the wiring is one config change, not a refactor.

**Related:** §5.

---

## 27. Outbound (customer-facing) webhooks

**Decision:** **Defer to derived projects.** No `packages/webhooks-outbound` ships in the template. Recipe documents the build-it-yourself path on top of `packages/jobs`.

**Why:**
- Per §0: ship abstractions + one reference implementation, not concrete vendors. Outbound webhooks have a delivery log, retry curve, replay protection, signing scheme, customer-visible delivery dashboard, and observability hooks — ~50% of which is product-shaped.
- A solo-founder vertical SaaS doesn't need this; a B2B platform needs a richer version than the template would default to. Defaulting either way is wrong.
- §6's job runner + `packages/jobs` already provides the durable retry substrate. The build is ~200 lines using `defineJob` + a `webhook_deliveries` table + an HMAC helper.

**Recipe:**
- `docs/recipes/outbound-webhooks.md` covers the table schema, signing convention (HMAC-SHA256 with rotating secret), retry curve (longer than the §6 default — customer endpoints often flake for hours), replay protection, and a worked example end-to-end.

**Tradeoffs:**
- Derived projects that need this rebuild ~200 lines. Acceptable; the recipe makes it ~1-day work, and no two derived projects would agree on the right defaults anyway.

**Related:** §6.

---

## 28. CORS & API access controls

**Decision:** **Same-origin by default.** No CORS headers on Server Actions or Route Handlers used by the template's own apps. Public API surface doesn't exist in the template; recipe covers the build when needed.

**Defaults:**
- Server Actions (§17) are same-origin by construction.
- Route Handlers consumed by the template's own apps: same-origin; no CORS.
- Webhooks: no CORS (providers don't send preflights).

**Public API path (recipe):**
- `docs/recipes/public-api.md` — `withCors({ origins, methods })` Route Handler wrapper, API key auth via a `api_keys` table, versioning convention (`/api/v1/...`), and integration with the §23 rate-limit tier system.

**Tradeoffs:**
- Derived projects with mobile clients (React Native) or third-party integrations need the recipe on day one. Already out-of-scope per §16, so consistent.

**Related:** §16, §17, §23.

---

## 29. Form / validation / toast layer

**Decision:** **React Hook Form + Zod + Sonner.** Shared form primitives in `packages/ui/forms`.

**Mechanics:**
- **React Hook Form** for client form state. Uncontrolled-first, cheap re-renders.
- **Zod** for validation, reusing the same schemas the API boundary uses — one schema definition serves the client form and the Server Action's server-side parse.
- **Sonner** for toasts (shadcn's official pick as of mid-2024). Imperative API, accessible, sane animations.
- `packages/ui/forms` exports `Field`, `Label`, `ErrorMessage`, `FormProvider` primitives wrapping shadcn + RHF, so derived projects don't redo the wiring per form.

**Why:**
- De-facto standard pairing in the Next.js ecosystem; minimal ramp-up for contributors.
- Schema reuse between client and server eliminates a class of drift bug.

**Tradeoffs:**
- RHF + Server Actions integration has rough edges (validation timing across client/server, pending states). Documented in package README; not blocking.

**Related:** §17.

---

## 30. Theming (dark mode)

**Decision:** Wired toggle, **defaults to `prefers-color-scheme`**, choice persisted in a cookie (SSR-safe, no flash).

**Mechanics:**
- Via `next-themes`. Switcher component in the user menu of both `apps/web` and `apps/admin`.
- Cookie (not localStorage) so the HTML class is set server-side from the cookie, preventing flash of wrong theme on first paint.
- shadcn primitives already support dark/light tokens — no extra theming work.

**Why:**
- Defaulting to system means dark-mode-on devices get dark mode immediately without hunting for a setting.
- Cost to ship is ~10 lines + a switcher component. Retrofitting later is meaningfully more work.

**Tradeoffs:**
- Derived projects that want a single hard-coded theme delete the switcher and pin the cookie value. ~5 minutes.

**Related:** §8.

---

## 31. `packages/config` content

**Decision:** `packages/config` ships four subdirectories, each exposing presets that surfaces extend.

**Layout:**
```
packages/config/
  tsconfig/
    tsconfig.base.json
    tsconfig.next.json
    tsconfig.node.json
    tsconfig.react.json
  eslint/
    base.js
    next.js
    node.js
    react.js
  prettier/
    prettier.config.js
  tailwind/
    preset.ts
```

**Specifics:**
- **tsconfig** — base sets strictness per §32. Surface-specific configs add `jsx`, `lib`, `moduleResolution`, etc.
- **eslint** — flat config (eslint 9+). Includes the `getServiceClient` import-ban rule from §11 in the `next.js` preset (applied to `apps/web/**`).
- **prettier** — single shared config: 100-char line width, semi, single quotes, trailing commas. Plain.
- **tailwind** — base preset (colors, spacing, typography scale, breakpoints). `apps/web`, `apps/admin`, and `packages/ui` extend it.

**Tradeoffs:**
- Updating a shared config requires bumping every consumer. Mitigated by `workspace:*` deps so the bump is automatic on `pnpm install`.

**Related:** §2, §11, §32.

---

## 32. TypeScript strictness level

**Decision:** `strict: true` + `noUncheckedIndexedAccess: true` + `noImplicitOverride: true`. **Skip `exactOptionalPropertyTypes`.**

**Why:**
- `strict: true` — non-negotiable.
- `noUncheckedIndexedAccess` catches `arr[0]` being potentially undefined, which is a real source of runtime bugs in App Router code where Server Components freely index untyped JSON.
- `noImplicitOverride` is cheap; surfaces accidental overrides in class hierarchies (Drizzle schemas, etc.).
- `exactOptionalPropertyTypes` interacts badly with too many libs (React props, Zod inference); ergonomic cost exceeds the safety added.

**Tradeoffs:**
- `noUncheckedIndexedAccess` adds friction in test fixtures and quick-and-dirty code. Worth it; the workaround (`arr[0]!`) is explicit, which is the point.

**Related:** §31.

---

## 33. Folder structure within each Next.js app

**Decision:** Same layout for `apps/web` and `apps/admin`. Server Actions and data-access helpers live in `lib/`, not co-located inside route files. Apps don't import each other.

**Layout:**
```
app/
  (auth)/              # route group: signup, login, verify, accept-invite
  (marketing)/         # web-only: public landing
  (app)/               # authenticated app
    [orgSlug]/
      layout.tsx       # active-org middleware lift
      dashboard/
      settings/
  api/                 # Route Handlers (webhooks, public API surface)
components/            # app-local components (compose from packages/ui)
lib/
  actions/             # Server Actions, grouped by domain
  data/                # data-access helpers (RSC reads)
  utils/
middleware.ts          # auth, active-org, CSP nonce, rate-limit
```

**Conventions:**
- **Server Actions in `lib/actions/<domain>.ts`**, not co-located in route files. Grep-able; prevents accidental re-export from a page module.
- **Data-access helpers in `lib/data/<domain>.ts`**. Server Components call them directly; helpers wrap supabase-js (§11) and use `cache()` for per-request memoization.
- **Cross-app shared logic lives in `packages/*`**. `apps/admin` never imports from `apps/web` and vice versa.

**Tradeoffs:**
- Some developers prefer co-located actions/data files inside route segments. The split-out convention scales better and is grep-friendly; derived projects can move things around if they disagree.

**Related:** §2, §3, §11, §17.

---

## 34. CI specifics

**Decision:** Merge gate split by cost — fast suite on every PR; full suite on `main` and release tags. Per-PR Vercel previews; no per-PR Railway previews. **Changesets** for monorepo versioning.

**Merge gate composition:**
- **Every PR:** lint (eslint flat config), typecheck (`tsc --noEmit` per package), unit tests (Vitest + pytest), `.env.example` drift check (§13), schema drift check (§11), **migration validation** via local Supabase in the runner (§18).
- **`main` + release tags only:** Playwright E2E (§10), RLS test suite (§10), production builds of all surfaces.
- Split rationale: PR feedback under ~3 min for the inner loop; full suite on merge avoids E2E flake gating individual PRs.

**Preview environments:**
- Vercel previews per PR for `apps/web` and `apps/admin`, bound to dev-shared (§18).
- Railway services are **not** previewed per PR (cost + complexity vs. value). PRs touching workers run unit tests + a runner integration test against local pgmq.

**Release/versioning:**
- **Changesets** for the monorepo. PRs that touch `packages/*` require a changeset file (CI enforces). `packages/billing` follows §9's stability marker.
- Apps (`apps/*`, `services/*`) are unversioned — they're deployed, not published. Their changelog is the Git history.
- Template itself is consumed as a Git template repo (`gh repo create --template ...`), not a published artifact. No template-level version.

**Tradeoffs:**
- Changesets adds one PR-author step. Worth it; the alternative (auto-bump on every merge) loses semver intent.

**Related:** §6, §9, §10, §11, §13, §18.

---

## 35. Conventional Commits / PR title rules

**Decision:** Conventional Commits required on **PR titles**, not individual commits. **Squash-merge** to `main`.

**Mechanics:**
- PR titles enforced via `amannn/action-semantic-pull-request`. Individual commits inside a PR stay free-form.
- Squash-merge by default — PR title becomes the commit message. Keeps `main` history clean and Conventional-Commits-shaped without forcing contributors to rewrite working commits.
- Changesets (§34) consumes the commit history; the PR-title convention makes its inference reliable.

**Tradeoffs:**
- Squash-merge loses fine-grained commit history. Acceptable for a template; derived projects can flip to merge commits if they prefer.

**Related:** §34.

---

## 36. Dependency hygiene

**Decision:** **Renovate** (not Dependabot) for version bumps. **GitHub Dependabot security alerts** for advisories. `pnpm-lock.yaml` committed; CI uses `--frozen-lockfile`.

**Renovate config:**
- Auto-merge devDependencies patch + minor on green CI.
- Major upgrades for runtime deps (Next, React, Supabase) get their own PR with manual review.
- Group ecosystem upgrades (`@radix-ui/*`, `@opentelemetry/*`) so the changelog doesn't drown.
- Weekly schedule, not on every push.

**Security advisories:**
- GitHub Dependabot security alerts stay enabled (separate from version bumps).
- `pnpm audit` runs in CI on `main` weekly; high-severity findings open an issue automatically.

**Lockfile policy:**
- `pnpm-lock.yaml` at repo root (pnpm workspace standard).
- CI runs `pnpm install --frozen-lockfile`.

**Tradeoffs:**
- Auto-merge devDeps requires CI to be trustworthy — a flaky E2E that masquerades as green can ship a broken commit. Mitigated by §34's full-suite-on-main gate.

**Related:** §2, §34.

---

## 37. Going-forward decision log

**Decision:** `PROJECT_DEFINITIONS.md` is a **transitional scoping document.** Once §17-§37 are locked, content migrates to formal docs under `docs/`. This file retires to a stub pointing at the new location.

**Target structure:**
```
docs/
  architecture/
    README.md            # index, guiding principles (§0), scope (§16), format conventions
    01-stack.md          # §1, §3
    02-data.md           # §4, §11, §19, §20
    03-auth.md           # §5, §21
    04-billing.md        # §9, §22
    05-jobs.md           # §6, §24
    06-observability.md  # §8 (Sentry, PostHog), §15, §25
    07-frontend.md       # §8 (UI, Email), §29, §30, §33
    08-platform.md       # §2, §7, §13, §18
    09-api-boundary.md   # §17, §23, §28
    10-feature-flags.md  # §14
    11-config.md         # §31, §32
    12-local-dev.md      # §12
  constraints/
    budget.md            # cost ceilings, free-tier dependencies that drove decisions
    team.md              # team-size assumptions; scaling thresholds
  recipes/
    ...                  # the §-N referenced recipes
```

**Conventions for the architecture docs:**
- Format stays `Decision / Why / Tradeoffs / Related`, narrative tightened.
- **Budget/team-size reasoning is NOT embedded.** Decisions reference `constraints/budget.md` or `constraints/team.md`.
- Lifecycle: changes via PR. Significant changes use the PR description for discussion — no separate RFC tooling.
- Superseded sections marked at the top with a pointer to the replacement; original content preserved.

**Migration plan:**
- Single PR (or short sequence) so cross-references stay consistent.
- `PROJECT_DEFINITIONS.md` retires to a stub pointing at `docs/architecture/` once migration is complete.

**Tradeoffs:**
- Splitting into many files makes the full picture harder to scan vs. one file. Mitigated by a top-level `docs/architecture/README.md` index and a stable §-number → file mapping in the README.
- One more convention contributors must learn. Documented in the README.

**Related:** all.

---

## Open questions & pending decisions

Captured from a doc audit. Grouped by type and severity. Item numbering is stable within this section so other documents/conversations can reference them.

---

### B. Structural decisions — RESOLVED

All B items resolved and promoted to first-class decisions:

- **B1. API boundary pattern** → resolved in **§17**.
- **B2. Environments topology** → resolved in **§18**.
- **B3. DB schema conventions** → resolved in **§19**.
- **B4. Migration deploy order & rollback model** → resolved in **§20**.
- **B5. Onboarding & invitation flows** → resolved in **§21**.
- **B6. Entitlements read-API surface** → resolved in **§22**.

---

### C. Operational decisions — RESOLVED

All C items resolved and promoted to first-class decisions:

- **C1. Rate limiting** → resolved in **§23**.
- **C2. Worker health checks + graceful shutdown** → resolved in **§24**.
- **C3. Security headers + CSP** → resolved in **§25**.
- **C4. OAuth provider defaults** → resolved in **§26**.
- **C5. Outbound (customer-facing) webhooks** → resolved in **§27**.
- **C6. CORS & API access controls** → resolved in **§28**.

---

### D. DX / app-layer decisions — RESOLVED

All D items resolved and promoted to first-class decisions:

- **D1. Form / validation / toast layer** → resolved in **§29**.
- **D2. Theming (dark mode)** → resolved in **§30**.
- **D3. `packages/config` content** → resolved in **§31**.
- **D4. TypeScript strictness level** → resolved in **§32**.
- **D5. Folder structure within each Next.js app** → resolved in **§33**.

---

### E. Process decisions — RESOLVED

All E items resolved and promoted to first-class decisions:

- **E1. CI specifics** → resolved in **§34**.
- **E2. Conventional Commits / PR title rules** → resolved in **§35**.
- **E3. Dependency hygiene tooling** → resolved in **§36**.
- **E4. Going-forward decision log** → resolved in **§37**.

All 21 open items (B1-B6, C1-C6, D1-D5, E1-E4) are resolved. Migration to `docs/architecture/` follows per §37.

---

### F. Things explicitly NOT in scope (yet)

Re-stated here for completeness; mirrors §16.

- Mobile clients (React Native / Expo).
- Internationalization beyond English copy.
- A design-token system beyond Tailwind defaults.
- Self-hosted deployment recipes.
- Provider-specific advanced billing features that don't generalize (Stripe Sigma, Paddle Retain, etc.).
- SAML / OIDC SSO for enterprise customers (Supabase has SAML; pricing/setup needs a decision that's likely product-level, not template-level).
- GDPR / data export / right-to-erasure tooling — significant surface; likely needs its own evaluation when a derived product hits a regulated market.

---

### G. Deferred to derived projects (not template-level)

- Chilean charging adapter pick (Fintoc / Webpay / both) — depends on each product's rails.
- E-invoicing emitter pick (Openfactura / Bsale / Haulmer / etc.) — depends on jurisdiction and product needs.
- PII redaction policy beyond the default redactor — driven by regulatory scope of each derived project.
- Uptime / status-page / on-call vendor — team-size decision (§15).
- Secrets-manager centralization (Doppler / Infisical / 1P) — team-size decision (§13).
