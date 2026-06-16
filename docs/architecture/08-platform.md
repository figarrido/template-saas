# Platform

Covers the monorepo, hosting, env & secrets, environments topology, and CI/release process.

---

## Monorepo

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
  ui/           # shadcn/ui components, Tailwind preset (see 07-frontend.md)
  db/           # Two-factory DB access (see 02-data.md)
  env/          # Per-surface Zod env schemas + generated .env.example
  flags/        # OpenFeature client + PostHog reference provider (see 10-feature-flags.md)
  billing/      # Provider-agnostic billing layer + Stripe reference adapter (see 04-billing.md)
  auth/         # auth helpers shared across web + admin
  config/       # eslint, tsconfig, tailwind, prettier (see 11-config.md)
  jobs/         # shared queue interface + job type definitions (see 05-jobs.md)
  email/        # React Email templates + Resend client (prod) / SMTP→InBucket (dev)
  observability/# Pino + structlog + OpenTelemetry init (see 06-observability.md)
```

**Why:**
- Turborepo is Vercel-native (remote cache works out of the box on Vercel deploys).
- pnpm workspaces are the de-facto standard for Next monorepos.
- `services/` deliberately separated from `apps/` so non-Vercel deploy targets don't get confused with Vercel projects.

**Tradeoffs:**
- Turborepo's task graph is simpler than Nx but less powerful. Fine here; re-evaluate if many non-JS targets show up.
- `packages/jobs` as a shared package enforces the type contract for job payloads across enqueuer (Next.js) and consumer (Node worker). Python worker needs a duplicated schema (Pydantic generated from JSON Schema) — accepted cost.

**Related:** [05-jobs](./05-jobs.md), [11-config](./11-config.md)

---

## Non-Vercel services hosting

**Decision:** **Railway** for both `services/worker-node` and `services/worker-py`.

**Python dependency management:** `uv` for `services/worker-py`. Single fast tool for resolution, locking (`uv.lock`), and venv management; no Poetry/pip-tools split. Dockerfile uses `uv sync --frozen` for reproducible builds.

**Why:**
- Simple Dockerfile-based deploys, good DX, pairs well with Vercel + Supabase.
- Cheap to start, no need to learn k8s or write Terraform for a template.

**Tradeoffs:**
- Railway is a smaller vendor than GCP/AWS; reliability has been good but worth monitoring. Migration path is easy because both services are Dockerized — they can move to Fly.io or Cloud Run with config-only changes.
- Egress costs are predictable but not free; mind the traffic between Railway ↔ Supabase.
- `uv` is young; API has stabilized but pin the version in CI and the Dockerfile to avoid surprise behavior changes.

**Related:** [05-jobs](./05-jobs.md)

---

## Env & secrets management

**Decision:** Native platform envs (Vercel + Railway + GitHub Actions) as the source of truth per platform. Schema centralized in `packages/env` with per-surface Zod schemas, validated at boot. Rotation handled by [recipes/secret-rotation.md](../recipes/secret-rotation.md). Centralization tools (Doppler, Infisical, 1Password) are recipes.

Centralization is intentionally deferred per [constraints/team](../constraints/team.md) — the recipe explains the threshold for upgrading.

### `packages/env`

- One Zod schema per surface: `apps/web`, `apps/admin`, `services/worker-node`, `services/worker-py`. Each exports a typed `env` object.
- Schemas split by **server / client / shared** within each surface — `apps/web/env.client.ts` cannot reference `SUPABASE_SERVICE_ROLE_KEY` even by accident, because the client schema doesn't include it. Reuses the `@t3-oss/env-nextjs` pattern.
- Boot-time validation: any missing/malformed env crashes the app on startup with a readable error, not at the first usage site. Means deploy failures, not surprise 500s in production.
- `.env.example` files are **generated** from the schemas (`pnpm env:example`). Drift between the validator and the example is impossible because the example doesn't exist by hand.
- Shared secrets (Supabase URL, service-role key, Sentry DSN) defined once in `packages/env/shared.ts` and composed into each surface's schema.

### Local dev

Bootstrap of `.env.local` files is owned by `pnpm setup` (see [12-local-dev](./12-local-dev.md)). `packages/env` participates by exposing each surface's schema so the script knows which vars to prompt for and validate.

### Deploy

- Vercel envs managed in each project's dashboard. Same for Railway. GitHub Actions secrets in repo settings.
- No template-shipped script syncs across platforms — that's where Doppler-class tools become valuable. The recipe explains the upgrade.

### Rotation runbook ([recipes/secret-rotation.md](../recipes/secret-rotation.md))

- Per high-value secret (Supabase service-role, Stripe webhook secret, Resend API key, etc.): checklist of locations, source-platform rotation procedure, and order of updates that minimizes downtime.
- Recipe form, not automation.

### Centralization recipes

- [recipes/secrets-doppler.md](../recipes/secrets-doppler.md)
- [recipes/secrets-infisical.md](../recipes/secrets-infisical.md)
- [recipes/secrets-1password.md](../recipes/secrets-1password.md)

**Tradeoffs:**
- **Drift between platforms is a real risk** under native-envs default. Same key in five places, no centralized source. This is the explicit reason Doppler/Infisical exist; the template's posture is "make the upgrade easy, don't ship it."
- **Boot-time validation can mask the real failure** when a secret rotation lands partial (e.g., service rolled but Stripe key didn't). Schema validation doesn't help here. Mitigation: the rotation runbook orders updates to avoid this; longer-term mitigation is centralization.
- **Each surface has its own env schema.** Means duplicate boilerplate. Acceptable: alternative is a single mega-schema with conditional optionality, which is harder to read.
- **`.env.example` regeneration** is one more thing to remember. Mitigated by a pre-commit hook or CI check.

**Related:** [12-local-dev](./12-local-dev.md), [../constraints/team](../constraints/team.md), [../constraints/budget](../constraints/budget.md)

---

## Environments topology

**Decision:** Two Supabase projects — **prod** and **dev-shared**. No per-PR DB branching by default. Migration safety enforced in CI via local Supabase.

DB branching is deferred per [constraints/budget](../constraints/budget.md); a dedicated staging is deferred per [constraints/team](../constraints/team.md). Recipes cover both upgrades.

### Architecture

- **dev-shared** receives merged migrations via a CI step on push to `main`. It's never branched. Vercel previews bind to dev-shared; PRs with unmerged migrations get a banner noting "preview reflects pre-migration schema."
- **CI per PR:** spin up local Supabase in the runner, apply the PR's migrations, run the RLS suite + a smoke test. This is the load-bearing safety net — no Supabase paid features needed.
- **Manual promote path:** `pnpm supabase:promote-pr` script applies a PR's migration set to dev-shared for authors who need it live before merge. Coordinated; documented.

### Recipes

- [recipes/db-branching.md](../recipes/db-branching.md) — when to upgrade to Supabase branching.
- [recipes/staging-environment.md](../recipes/staging-environment.md) — when to add a third Supabase project + Vercel/Railway envs.

**Tradeoffs:**
- Open PRs share dev-shared row state — can collide. Acceptable at template scale.
- PR previews don't reflect unmerged schema changes. Documented limitation; CI catches the migration safety story regardless.

**Related:** [02-data](./02-data.md), [12-local-dev](./12-local-dev.md), [../constraints/budget](../constraints/budget.md), [../constraints/team](../constraints/team.md)

---

## CI specifics

**Decision:** Merge gate split by cost — fast suite on every PR; full suite on `main` and release tags. Per-PR Vercel previews; no per-PR Railway previews. Changesets for monorepo versioning. Turborepo remote cache.

### Merge gate composition

- **Every PR:** lint (eslint flat config), typecheck (`tsc --noEmit` per package), unit tests (Vitest + pytest), `.env.example` drift check, schema drift check, **migration validation** via local Supabase in the runner.
- **`main` + release tags only:** Playwright E2E, RLS test suite, production builds of all surfaces.
- Split rationale: PR feedback under ~3 min for the inner loop; full suite on merge avoids E2E flake gating individual PRs.

### Preview environments

- Vercel previews per PR for `apps/web` and `apps/admin`, bound to dev-shared.
- Railway services are **not** previewed per PR. PRs touching workers run unit tests + a runner integration test against local pgmq.

### Release / versioning

- **Changesets** for the monorepo. PRs that touch `packages/*` require a changeset file (CI enforces). `packages/billing` follows its own stability marker (see [04-billing](./04-billing.md)).
- Apps (`apps/*`, `services/*`) are unversioned — they're deployed, not published. Their changelog is the Git history.
- Template itself is consumed as a Git template repo (`gh repo create --template ...`), not a published artifact.

**Tradeoffs:**
- Changesets adds one PR-author step. Worth it; auto-bump on every merge loses semver intent.

**Related:** [02-data](./02-data.md#testing), [04-billing](./04-billing.md)

---

## Conventional Commits / PR title rules

**Decision:** Conventional Commits required on **PR titles**, not individual commits. **Squash-merge** to `main`.

**Mechanics:**
- PR titles enforced via `amannn/action-semantic-pull-request`. Individual commits inside a PR stay free-form.
- Squash-merge by default — PR title becomes the commit message. Keeps `main` history clean and Conventional-Commits-shaped without forcing contributors to rewrite working commits.
- Changesets consumes the commit history; the PR-title convention makes its inference reliable.

**Tradeoffs:**
- Squash-merge loses fine-grained commit history. Acceptable for a template; derived projects can flip to merge commits if they prefer.

---

## Dependency hygiene

**Decision:** **Renovate** (not Dependabot) for version bumps. **GitHub Dependabot security alerts** for advisories. `pnpm-lock.yaml` committed; CI uses `--frozen-lockfile`.

### Renovate config

- Auto-merge devDependencies patch + minor on green CI.
- Major upgrades for runtime deps (Next, React, Supabase) get their own PR with manual review.
- Group ecosystem upgrades (`@radix-ui/*`, `@opentelemetry/*`) so the changelog doesn't drown.
- Weekly schedule, not on every push.

### Security advisories

- GitHub Dependabot security alerts stay enabled (separate from version bumps).
- `pnpm audit` runs in CI on `main` weekly; high-severity findings open an issue automatically.

### Lockfile policy

- `pnpm-lock.yaml` at repo root (pnpm workspace standard).
- CI runs `pnpm install --frozen-lockfile`.

**Tradeoffs:**
- Auto-merge devDeps requires CI to be trustworthy. A flaky E2E that masquerades as green can ship a broken commit. Mitigated by the full-suite-on-main gate above.
