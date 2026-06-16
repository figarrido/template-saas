# template-saas

A SaaS template. See [`docs/architecture/`](./docs/architecture/) for every decision and [`CLAUDE.md`](./CLAUDE.md) for working notes.

## What this is

Next.js (App Router) + Supabase + Tailwind + Vercel + Railway. Two apps (`apps/web`, `apps/admin`), two workers (`services/worker-node`, `services/worker-py`), shared packages under `packages/*`. RLS is structural, not by convention.

This is a **template**, not a product. Country/jurisdiction/product-specific adapters live in derived projects against the template's interfaces — not here.

## Quick start

Prerequisites on a dev machine: Docker, Node 22+, pnpm 10+, Python 3.11+, [uv](https://github.com/astral-sh/uv), [Supabase CLI](https://supabase.com/docs/guides/cli), [Stripe CLI](https://docs.stripe.com/stripe-cli).

```sh
pnpm setup        # idempotent: install + supabase start + migrations + seed + .env.local prompts
pnpm dev          # turbo runs web + admin + worker-node + worker-py
pnpm dev:webhooks # stripe listen --forward-to ...
```

See [`docs/architecture/12-local-dev.md`](./docs/architecture/12-local-dev.md) for the full local dev workflow.

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
