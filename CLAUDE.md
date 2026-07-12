# Claude working notes

This repo is a **SaaS template**, not a product. The architecture is decided in `docs/architecture/`; this file orients you on what matters when answering questions or writing code. Treat `docs/architecture/*.md` and `docs/constraints/*.md` as the source of truth — if you change behavior that contradicts them, update them in the same change.

---

## Guiding principles (apply to every suggestion)

From `docs/architecture/README.md`. When a proposal seems to violate one, the proposal is wrong.

- **Template, not product.** The first product built from it is *context* for what abstractions need to exist — not a license to bake product-specific code into the template.
- **Ship abstractions + one reference implementation, not concrete vendors.** Country-, jurisdiction-, or product-specific adapters live in derived projects against the template's interfaces.
- **Optimize for "fast to add later," not "covers everything now."** Every concrete adapter shipped is weight every derived project carries.
- **Pick the most universal reference.** When the template needs one concrete example, pick the option with widest applicability and best sandbox/docs — not the option most relevant to a first product.

Corollaries:
- Don't add a second charging adapter (Fintoc/Webpay/Paddle) "for completeness" — Stripe is the only reference.
- Don't ship an `EmitterProvider` adapter — the interface ships, no concrete emitter does.
- Don't pre-build country-specific helpers, PII redaction policies beyond the default, or i18n past English copy.

---

## Out of scope (don't propose these without asking)

`docs/architecture/README.md` lists explicit non-goals. The big ones:
- Mobile clients (React Native / Expo).
- i18n beyond English.
- Self-hosted deployment recipes.
- Country-specific billing adapters or e-invoicing emitters.
- SAML/OIDC SSO, GDPR/data-export tooling.
- Per-PR DB branching, dedicated staging, log aggregator vendor, on-call rotation, centralized secrets manager — all deferred (see `docs/constraints/`).

If a request touches one of these, flag it and check whether it belongs in a derived project or as a recipe under `docs/recipes/`.

---

## Stack

`docs/architecture/01-stack.md`.

- **Next.js (App Router) + Supabase + Tailwind + Vercel**, TypeScript monorepo.
- **Two Next.js apps:** `apps/web` (client-facing) and `apps/admin` (internal). Separate Vercel projects. They never import each other; share via `packages/*`.
- **Two worker services on Railway:** `services/worker-node` (TS), `services/worker-py` (Python, `uv`).

---

## Monorepo layout

`docs/architecture/08-platform.md`.

```
apps/web        apps/admin
services/worker-node     services/worker-py
packages/
  ui            shadcn/ui + Tailwind preset                 (07-frontend)
  db            getUserClient / getServiceClient factories  (02-data)
  env           Per-surface Zod env schemas                 (08-platform)
  flags         OpenFeature client + PostHog provider       (10-feature-flags)
  billing       Provider-agnostic billing + Stripe ref      (04-billing)
  auth          can(membership, action) + helpers           (03-auth)
  config        eslint / tsconfig / tailwind / prettier     (11-config)
  jobs          Queue interface + defineJob/runWorker       (05-jobs)
  email         React Email + Resend(prod)/SMTP(dev)        (07-frontend)
  observability Pino + structlog + OTel init                (06-observability)
```

Inside each Next.js app:

```
app/         route groups: (auth) (marketing) (app)/[orgSlug]/...   api/ webhooks
components/  app-local components composing packages/ui
lib/actions/ Server Actions, grouped by domain (NOT colocated in route files)
lib/data/    RSC data-access helpers wrapping supabase-js
middleware.ts  auth, active-org, CSP nonce, rate-limit
```

---

## Critical conventions (don't break these)

### Data access — RLS is structural

- **`apps/web` uses `getUserClient(req)`** (supabase-js, RLS-honoring). Never service-role.
- **`apps/admin` and `services/*` use `getServiceClient()`** (Drizzle + service role) for cross-org queries.
- **ESLint forbids importing `getServiceClient` from `apps/web/**`.** If you propose code there that needs cross-org access, you're doing it wrong — push the operation behind an RPC or a worker job.
- All org-scoped tables carry `organization_id`. RLS policies key on `auth.uid()` + `memberships`.

### Schema conventions

- **PKs: UUID v7** (`uuid_generate_v7()`), named **`<table_singular>_id`** — `organizations.organization_id`, `profiles.user_id`. Enables `JOIN ... USING (organization_id)`.
- Junction tables get a surrogate `<junction>_id` PK + unique natural-key constraint.
- `created_at` + `updated_at` on every table; `moddatetime` trigger.
- Soft delete is opt-in (`deleted_at timestamptz null`), not default.
- snake_case plural table names; no domain prefixes (use Postgres schemas if separation needed).

### Migrations

- **Supabase CLI**, raw SQL under `supabase/migrations/`.
- **Forward-only, expand → dual-read → backfill → contract-read → drop.** Never write down-migrations.
- **DB migrations apply before code.** CI gate runs migrations against local Supabase per PR.

### API boundary

`docs/architecture/09-api-boundary.md`.

- **Server Actions** for mutations in both apps. **Route Handlers** for webhooks, cron, public/cross-origin.
- **No tRPC** — Server Actions + RSC subsume it.
- Rate limiting in **middleware** via `@upstash/ratelimit`. Webhooks bypass (signature verification protects them).
- **Same-origin by default.** No CORS on the template's own routes; public API is a recipe.

### Auth

`docs/architecture/03-auth.md`.

- Supabase Auth, **email/password only by default**. OAuth wired but disabled.
- Admin enforcement (in order): authenticated session → `admin_users` row → MFA verified. Failure → **404, not 403**.
- All admin mutations write to `admin_audit_log`.
- Multi-org from day one — `profiles` (1:1 with `auth.users`), `memberships`, `invitations`, `active_organization_id` cookie. Roles: `owner` / `manager` / `member` (the `admin` role was renamed to `manager` — see [ADR 0001](docs/adr/0001-rename-admin-role-to-manager.md)). Central `can(membership, action)` helper in `packages/auth`.

### Billing

`docs/architecture/04-billing.md`.

- **Charging and tax-document emission are separate concerns.** `BillingProvider` and `EmitterProvider` interfaces.
- Only `providers/stripe` ships. **No emitter adapter ships.**
- `Charge` (internal billing record) ≠ `Invoice` (legal e-invoice). Both modeled at template level; emission happens on `billing.charge.paid`. ("Customer" is adapter-internal; the entity billed is the Organization, linked per-provider via `BillingAccount`.)
- Plans/entitlements live in DB; provider price IDs map *to* internal plan IDs.
- `packages/billing` is `0.x.y` until the first non-Stripe adapter exists. Pin exact versions in derived projects.

### Jobs

`docs/architecture/05-jobs.md`.

- Substrate: **pgmq** + **pg_cron**. Wrapper in `packages/jobs` (TS) with mirrored Python module.
- `defineJob` (typed via Zod) + `runWorker`. Default retry curve `30s / 2m / 10m / 1h / 6h`, max 5 attempts.
- Python schemas are **generated** from TS Zod (JSON Schema → datamodel-code-generator). Don't hand-write Pydantic.
- Workers expose `GET /health`; SIGTERM triggers a configurable drain. Visibility timeout is the no-job-loss safety net.

### Flags vs. entitlements

`docs/architecture/10-feature-flags.md`, `04-billing.md`.

- **Entitlements** = paid/granted access (billing-derived). Mistoggle = legal issue. Lives in `packages/billing`.
- **Flags** = rollout / experiment / kill switch. Mistoggle = UX bug. Lives in `packages/flags` (OpenFeature, PostHog reference provider).
- Gated features check both: `if (entitlements.has('pro') && flags.isOn('new_dashboard'))`.
- `packages/flags` does **not** import `packages/billing` — entitlements API is injected.

### Observability

`docs/architecture/06-observability.md`.

- **Sentry** for errors across all runtimes. **PostHog** for analytics.
- **OpenTelemetry** for trace context (W3C `traceparent`), propagated across HTTP and across pgmq via job-payload serialization. Sentry consumes OTel spans — no double instrumentation.
- Logging: Pino (Node) + structlog (Python), JSON to stdout. Standard fields: `service`, `env`, `request_id`, `job_id`, `org_id`, `user_id`, `trace_id`, `span_id`, `release`.
- **No log aggregator ships** — connection recipes only.
- CSP is nonce-based in middleware; static headers in `next.config.js`. `apps/admin` is stricter than `apps/web`.

### Frontend

`docs/architecture/07-frontend.md`.

- **shadcn/ui** components copied into `packages/ui` (not npm-installed). Re-run `shadcn add` to update.
- Forms: **React Hook Form + Zod + Sonner**. Reuse the same Zod schema for client and Server Action validation.
- Emails: **React Email**. Resend in prod, SMTP→InBucket in dev.
- Theming: `next-themes`, default `prefers-color-scheme`, cookie-persisted (SSR-safe).

### Env & secrets

- `packages/env` with per-surface Zod schemas, split **server/client/shared**. Boot-time validation crashes on missing/malformed envs.
- `.env.example` is **generated** from schemas (`pnpm env:example`) — never hand-edited.
- Native platform envs (Vercel + Railway + GitHub Actions) are the source of truth per platform. No centralized secrets manager in template.

### TypeScript strictness

`docs/architecture/11-config.md`.

- `strict: true` + `noUncheckedIndexedAccess: true` + `noImplicitOverride: true`.
- **Skip `exactOptionalPropertyTypes`** — ergonomic cost exceeds safety.

### CI

`docs/architecture/08-platform.md`.

- **Per PR:** lint, typecheck, unit tests, `.env.example` drift, schema drift, migration validation against local Supabase.
- **`main` + release tags only:** Playwright E2E, RLS suite, prod builds.
- Conventional Commits enforced on **PR titles** (not commits). Squash-merge.
- **Changesets** required for PRs touching `packages/*`. Apps/services are unversioned.

---

## Local dev

`docs/architecture/12-local-dev.md`.

- **`pnpm setup`** — canonical bootstrap (idempotent).
- **`pnpm dev`** — turbo runs `apps/web`, `apps/admin`, both workers in parallel.
- **`pnpm dev:webhooks`** — `stripe listen --forward-to localhost:3000/api/webhooks/billing/stripe`.
- **`pnpm db:reset`** / **`pnpm db:types`** — Supabase reset / regen types.
- Seed in `supabase/seed.sql`: 1 Operator, 1 user, 1 org with both as members, 1 plan/entitlement, 1 queued job. Deliberately small.
- Sentry no-ops locally; PostHog no-ops if `POSTHOG_KEY` absent.

---

## Code graph

A queryable tree-sitter graph of the codebase (built with [graphify](https://github.com/safishamsi/graphify)) may exist at `graphify-out/graph.json`. Prefer it over broad file reading when locating code:

- `graphify query "<question>"` / `graphify explain "<Symbol>"` / `graphify path "<A>" "<B>"`.
- Missing? Build it with `pnpm graph` (seconds, incremental; the binary comes from `uv tool install graphifyy==0.9.9`). If the tool isn't installed, fall back to grep — don't install it unasked.
- Edges are tagged `EXTRACTED` (AST fact) or `INFERRED` (confidence-scored guess) — confirm INFERRED edges by reading the file.
- The graph answers "what exists / what connects to what"; CLAUDE.md and `docs/` answer "why". `.graphifyignore` deliberately excludes docs/media so builds need no LLM key — don't remove those patterns.
- `graphify-out/` and `.graphify/` are generated and gitignored. **Never commit them** — a committed graph goes stale on every merge and would hand conflicts to the sandcastle merge phase. Rebuild instead of hand-editing.

---

## Adding or changing decisions

`docs/architecture/README.md` § Adding or changing a decision:

- **New decision** → new section in the relevant `docs/architecture/NN-*.md`. Follow the `Decision / Why / Tradeoffs / Related` format.
- **Superseding** → add the new section, mark the old one `**SUPERSEDED →** [link]`, preserve original content for provenance.
- **No budget or team-size reasoning embedded in architecture docs.** Link to `docs/constraints/budget.md` or `docs/constraints/team.md` and state the threshold there.
- Cross-references use **relative links**, not legacy `§N` references.
- Recipes (vendor integrations, upgrade paths) live under `docs/recipes/`.

---

## Doc index (where decisions live)

| File | Covers |
|------|--------|
| `docs/architecture/01-stack.md` | Stack baseline; admin vs. client app split |
| `docs/architecture/02-data.md` | Multi-tenancy + RLS; DB tooling; schema; migrations; testing |
| `docs/architecture/03-auth.md` | Authentication; OAuth defaults; onboarding + invitations |
| `docs/architecture/04-billing.md` | Provider-agnostic billing; entitlements read API |
| `docs/architecture/05-jobs.md` | pgmq jobs; worker health + graceful shutdown |
| `docs/architecture/06-observability.md` | Sentry; logs + OTel; analytics; CSP |
| `docs/architecture/07-frontend.md` | UI; email; forms; theming; folder structure |
| `docs/architecture/08-platform.md` | Monorepo; Railway; env & secrets; envs topology; CI; deps |
| `docs/architecture/09-api-boundary.md` | Server Actions vs. Route Handlers; rate limit; CORS |
| `docs/architecture/10-feature-flags.md` | OpenFeature + PostHog; overrides; entitlements separation |
| `docs/architecture/11-config.md` | `packages/config`; TS strictness |
| `docs/architecture/12-local-dev.md` | Local dev workflow |
| `docs/constraints/budget.md` | Free-tier posture; revisit thresholds |
| `docs/constraints/team.md` | 1-3 contributor assumptions; scaling thresholds |

---

## Agent skills

Per-repo configuration the engineering skills (`to-issues`, `triage`, `to-prd`, `qa`, `improve-codebase-architecture`, `diagnosing-bugs`, `tdd`) read.

### Issue tracker

GitHub Issues on `figarrido/template-saas` (via `gh`); external PRs are also a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical defaults — `needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix` — plus repo-specific `tracking` for parent/spec issues whose work lands via children (never combined with `ready-for-agent`). See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context (`CONTEXT-MAP.md` at root; one resolved shared context today, per-surface contexts added lazily). See `docs/agents/domain.md`.
