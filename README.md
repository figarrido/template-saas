# template-saas

A SaaS template. See [`docs/architecture/`](./docs/architecture/) for every decision and [`CLAUDE.md`](./CLAUDE.md) for working notes.

## What this is

Next.js (App Router) + Supabase + Tailwind + Vercel + Railway. Two apps (`apps/web`, `apps/admin`), two workers (`services/worker-node`, `services/worker-py`), shared packages under `packages/*`. RLS is structural, not by convention.

This is a **template**, not a product. Country/jurisdiction/product-specific adapters live in derived projects against the template's interfaces — not here.

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

## Code graph (optional)

[Graphify](https://github.com/safishamsi/graphify) builds a queryable tree-sitter graph of the codebase. The sandcastle agents use it to find reuse candidates before writing code; it's equally useful for architecture reviews or any AI-assisted session.

```sh
uv tool install graphifyy==0.9.9   # one-time; installs the `graphify` binary
pnpm graph                         # build → graphify-out/ (seconds; re-runs are incremental)
graphify query "what implements billing providers?"
graphify explain "BillingProvider"
graphify path "StripeProvider" "Charge"
```

The graph is **derived state, like `node_modules`**: `graphify-out/` is gitignored and never committed — a committed graph goes stale on every merge and would feed unresolvable conflicts to the sandcastle merge step. Every consumer builds its own from its checkout (you via `pnpm graph`, each sandcastle sandbox via its install hook), so the graph is always in sync with the code it describes. The committed [`.graphifyignore`](./.graphifyignore) keeps the corpus code-only, so building needs no LLM API key.

## Layout

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

## Docs

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
