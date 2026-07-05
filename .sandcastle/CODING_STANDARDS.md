# Coding Standards

<!-- Loaded by the reviewer agent via @.sandcastle/CODING_STANDARDS.md so these
     standards are enforced during review without costing tokens during
     implementation. Distilled from CLAUDE.md and docs/architecture/ — those
     remain the source of truth; keep this file in sync when they change. -->

## Template, not product

- This repo is a SaaS **template**. Reject product-, country-, or jurisdiction-specific code — it belongs in derived projects.
- No second vendor adapters: Stripe is the only billing adapter; no e-invoice emitter adapter ships; no extra OAuth providers enabled.

## Data access & RLS

- `apps/web` uses `getUserClient(req)` (RLS-honoring) — **never** `getServiceClient` or the service role. Cross-org operations go behind an RPC or a worker job.
- `apps/admin` and `services/*` use `getServiceClient()` (Drizzle + service role).
- All org-scoped tables carry `organization_id`.

## Schema & migrations

- PKs are UUID v7 named `<table_singular>_id` (e.g. `organizations.organization_id`). Junction tables get a surrogate PK plus a unique natural-key constraint.
- Every table has `created_at` + `updated_at` (moddatetime trigger). Soft delete is opt-in, not default. snake_case plural table names.
- Migrations are raw SQL under `supabase/migrations/`, **forward-only** (expand → dual-read → backfill → contract-read → drop). No down-migrations. Migrations apply before code.

## API boundary & auth

- Mutations use **Server Actions** (grouped in `lib/actions/`, not colocated in route files); Route Handlers only for webhooks, cron, and public/cross-origin endpoints. No tRPC. No CORS on the template's own routes.
- Authorization goes through `can(membership, action)` from `packages/auth`. Roles are `owner` / `manager` / `member` (no `admin` role).
- Admin enforcement failures return **404, not 403**. Admin mutations write to `admin_audit_log`.

## Billing, flags, entitlements

- `Charge` (internal billing record) ≠ `Invoice` (legal e-invoice) — don't conflate them.
- **Entitlements** (paid access, in `packages/billing`) vs **flags** (rollout/experiment, in `packages/flags`) stay separate; `packages/flags` must not import `packages/billing`.

## Frontend

- Forms use React Hook Form + Zod + Sonner, with the **same Zod schema** shared between client and Server Action validation.
- UI composes `packages/ui` (shadcn/ui copies); emails use React Email.

## TypeScript

- `strict` + `noUncheckedIndexedAccess` + `noImplicitOverride` are on: no `any`, no unsafe casts, no unchecked index access.
- `.env` access goes through `packages/env` schemas; `.env.example` is generated (`pnpm env:example`), never hand-edited.

## Commits & changesets

- Conventional Commits format for commit messages.
- Changes under `packages/*` require a changeset file in `.changeset/`.
