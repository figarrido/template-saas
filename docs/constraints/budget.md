# Budget constraints

The template's default posture is **free-tier-where-possible.** Architecture decisions reference this document instead of embedding "because free plan" rationale inline.

Derived projects with an explicit infra budget override these defaults per their actual allocation.

---

## Decisions driven by this constraint

### Two Supabase projects (prod + dev-shared), no DB branching

- **Constraint:** Supabase DB branching is a paid feature.
- **Decision location:** [architecture/08-platform.md](../architecture/08-platform.md) — Environments topology.
- **Revisit threshold:** team has 3+ active PRs/week, *or* schema is migration-heavy, *or* PR previews routinely collide on dev-shared row state.
- **Upgrade path:** [recipes/db-branching.md](../recipes/db-branching.md) covers when, CI integration, and cost ballpark.

### Upstash Redis for rate limiting

- **Constraint:** Free tier of `@upstash/ratelimit` is sufficient at template workloads. Vercel KV / Redis Cloud / managed Postgres alternatives all have higher floors.
- **Decision location:** [architecture/09-api-boundary.md](../architecture/09-api-boundary.md) — Rate limiting.
- **Revisit threshold:** production traffic exceeds Upstash free quotas.
- **Upgrade path:** [recipes/rate-limit-pgmq.md](../recipes/rate-limit-pgmq.md) covers a Postgres-backed alternative for derived projects that want zero extra vendors.

### Stdout default for observability transport

- **Constraint:** No log aggregator vendor in the template.
- **Decision location:** [architecture/06-observability.md](../architecture/06-observability.md) — Operational observability.
- **Revisit threshold:** production traffic requires cross-surface log search (essentially always at production scale).
- **Upgrade path:** vendor recipes — `recipes/observability-betterstack.md`, `observability-axiom.md`, `observability-grafana-cloud.md`, `observability-datadog.md`. The choice is deferred; the field conventions ship in the template.

### Native platform envs for secrets

- **Constraint:** No Doppler / Infisical / 1Password CLI prerequisite for contributors.
- **Decision location:** [architecture/08-platform.md](../architecture/08-platform.md) — Env & secrets management.
- **Revisit threshold:** 3+ contributors, *or* monthly secret rotation cadence. (Cross-referenced with [team.md](./team.md).)
- **Upgrade path:** `recipes/secrets-doppler.md`, `recipes/secrets-infisical.md`, `recipes/secrets-1password.md`.

### No log aggregator, uptime checks, or on-call rotation

- **Constraint:** Each of these has a vendor or sub-vendor cost that doesn't earn its keep at template scale.
- **Decision location:** [architecture/06-observability.md](../architecture/06-observability.md) — scope boundary.
- **Revisit threshold:** product is in production with paying customers. (Cross-referenced with [team.md](./team.md) for on-call rotation specifically.)
- **Upgrade path:** out of template scope; derived projects pick.

---

## What this document is NOT

- A budget *number*. The template doesn't presume a dollar figure; it presumes "free tiers cover this" as the lowest meaningful constraint. Derived projects with an explicit budget allocation should write their own `budget.md` overriding these decisions.
- A prohibition on paid services. The template ships sandbox/test integrations with Stripe, Resend, Sentry, etc. — these are part of the runtime, not optional. The constraint is on *additional* vendors required to operate the default surface.
