# template-saas

A production-shaped, opinionated **SaaS template** — multi-tenant from day one, RLS enforced structurally, billing that separates charging from tax-document emission, and background jobs on Postgres. Fork it, delete what you don't need, and ship.

[![CI](https://github.com/figarrido/template-saas/actions/workflows/ci.yml/badge.svg)](https://github.com/figarrido/template-saas/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-App_Router-black?logo=next.js)](https://nextjs.org)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres_%2B_RLS-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)

> This is a **template**, not a product. Country-, jurisdiction-, and product-specific adapters live in derived projects against the template's interfaces — not here. Every concrete vendor shipped is weight every derived project carries, so the template ships **abstractions plus one reference implementation**, no more.

Every architectural decision is written down in [`docs/architecture/`](./docs/architecture/); [`CLAUDE.md`](./CLAUDE.md) is the working-notes orientation for AI-assisted sessions.

## Table of contents

- [Highlights](#highlights)
- [Stack](#stack)
- [Quick start](#quick-start)
- [Code graph](#code-graph)
- [Repository layout](#repository-layout)
- [Documentation](#documentation)
- [License](#license)

## Highlights

- **Structural multi-tenancy.** RLS is enforced by the client factory, not by convention. `apps/web` uses `getUserClient(req)` (RLS-honoring); only `apps/admin` and workers use `getServiceClient()`. ESLint forbids the service-role client in client-facing code — cross-org access has to go through an RPC or a job.
- **Multi-org from day one.** `profiles`, `memberships`, `invitations`, and an active-org cookie ship out of the box, with `owner` / `manager` / `member` roles behind a single `can(membership, action)` helper.
- **Provider-agnostic billing.** Charging and tax-document emission are separate concerns behind `BillingProvider` and `EmitterProvider` interfaces. Stripe is the only charging reference; plans and entitlements live in the DB.
- **Background jobs on Postgres.** pgmq + pg_cron under a typed `defineJob` / `runWorker` wrapper, with a Node worker and a Python worker whose schemas are generated from the same Zod definitions.
- **Entitlements ≠ flags.** Paid access (billing-derived, mistoggle = legal issue) is kept cleanly separate from rollout flags (OpenFeature + PostHog, mistoggle = UX bug).
- **Observability baked in.** Sentry, PostHog, and OpenTelemetry trace context propagated across HTTP and through the job queue, with structured JSON logging (Pino + structlog).
- **Type-safe config.** Per-surface Zod env schemas with boot-time validation; `.env.example` is generated, never hand-edited.
- **Forward-only migrations.** Raw SQL under `supabase/migrations/`, expand → dual-read → backfill → contract → drop, validated against local Supabase on every PR.
- **Isolated admin surface.** `apps/admin` is a separate Vercel project with stricter CSP, an audit log on every mutation, and 404-not-403 enforcement.

## Stack

**Next.js (App Router) + Supabase + Tailwind + Vercel + Railway**, a TypeScript monorepo managed with pnpm and turbo.

Two Next.js apps — `apps/web` (client-facing) and `apps/admin` (internal) — deploy as separate Vercel projects and never import each other; they share code through `packages/*`. Two worker services run on Railway: `services/worker-node` (TypeScript) and `services/worker-py` (Python, `uv`).

## Quick start

Host prerequisites — things pnpm can't pin:

- Docker (for Supabase's local stack).
- Node 22+ and pnpm 9.15+ (chicken-and-egg with everything else).
- Python 3.11+ and [uv](https://github.com/astral-sh/uv) — `services/worker-py` only.

Project-pinned via `pnpm install` (no host install required):

- Supabase CLI — `supabase` workspace dev dep, binary downloaded into `node_modules/.bin` by postinstall.
- Stripe CLI — `@stripe/cli` workspace dev dep, same pattern.
- All Node tooling (turbo, drizzle-kit, vitest, eslint, prettier, tsx, …).

```sh
pnpm setup        # idempotent: install + supabase start + migrations + seed + .env.local prompts
pnpm dev          # turbo runs web + admin + worker-node + worker-py
pnpm dev:webhooks # stripe listen --forward-to ...
```

See [`docs/architecture/12-local-dev.md`](./docs/architecture/12-local-dev.md) for the full local dev workflow.

## Code graph

[Graphify](https://github.com/safishamsi/graphify) builds a queryable tree-sitter graph of the codebase. The sandcastle agents use it to find reuse candidates before writing code; it's equally useful for architecture reviews or any AI-assisted session.

```sh
uv tool install graphifyy==0.9.9   # one-time; installs the `graphify` binary
pnpm graph                         # build → graphify-out/ (seconds; re-runs are incremental)
graphify query "what implements billing providers?"
graphify explain "BillingProvider"
graphify path "StripeProvider" "Charge"
```

The graph is **derived state, like `node_modules`**: `graphify-out/` is gitignored and never committed — a committed graph goes stale on every merge and would feed unresolvable conflicts to the sandcastle merge step. Every consumer builds its own from its checkout (you via `pnpm graph`, each sandcastle sandbox via its install hook), so the graph is always in sync with the code it describes. The committed [`.graphifyignore`](./.graphifyignore) keeps the corpus code-only, so building needs no LLM API key.

## Repository layout

```
apps/web        apps/admin
services/worker-node     services/worker-py
packages/
  config        eslint / tsconfig / tailwind / prettier
  env           per-surface Zod env schemas
  db            getUserClient / getServiceClient factories
  auth          can(membership, action) + helpers
  ui            shadcn/ui + Tailwind preset
  email         React Email + Resend(prod) / SMTP(dev)
  billing       Provider-agnostic billing + Stripe ref
  jobs          Queue interface + defineJob/runWorker
  observability Pino + structlog + OTel init
  flags         OpenFeature client + PostHog provider
```

## Documentation

| File | Covers |
|------|--------|
| [`docs/architecture/01-stack.md`](./docs/architecture/01-stack.md) | Stack baseline; admin vs. client app split |
| [`docs/architecture/02-data.md`](./docs/architecture/02-data.md) | Multi-tenancy + RLS; schema; migrations; testing |
| [`docs/architecture/03-auth.md`](./docs/architecture/03-auth.md) | Authentication; OAuth defaults; onboarding |
| [`docs/architecture/04-billing.md`](./docs/architecture/04-billing.md) | Provider-agnostic billing; entitlements |
| [`docs/architecture/05-jobs.md`](./docs/architecture/05-jobs.md) | pgmq jobs; worker health + drain |
| [`docs/architecture/06-observability.md`](./docs/architecture/06-observability.md) | Sentry; logs + OTel; analytics; CSP |
| [`docs/architecture/07-frontend.md`](./docs/architecture/07-frontend.md) | UI; email; forms; theming |
| [`docs/architecture/08-platform.md`](./docs/architecture/08-platform.md) | Monorepo; Railway; env & secrets; CI |
| [`docs/architecture/09-api-boundary.md`](./docs/architecture/09-api-boundary.md) | Server Actions vs. Route Handlers |
| [`docs/architecture/10-feature-flags.md`](./docs/architecture/10-feature-flags.md) | OpenFeature + PostHog; entitlements separation |
| [`docs/architecture/11-config.md`](./docs/architecture/11-config.md) | `packages/config`; TS strictness |
| [`docs/architecture/12-local-dev.md`](./docs/architecture/12-local-dev.md) | Local dev workflow |

Architectural decision records live in [`docs/adr/`](./docs/adr/); scope and non-goals are in [`docs/architecture/README.md`](./docs/architecture/README.md) and [`docs/constraints/`](./docs/constraints/).

## License

[MIT](./LICENSE) © 2026
