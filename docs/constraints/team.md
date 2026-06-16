# Team constraints

The template's default posture assumes **1-3 contributors** working on a derived product. Architecture decisions reference this document instead of embedding "for a small team" rationale inline.

Derived projects with larger teams override these defaults via the recipes referenced below.

---

## Decisions driven by this constraint

### No dedicated staging environment

- **Constraint:** Two-person team can review and roll forward quickly; a third pre-prod environment is overhead, not safety.
- **Decision location:** [architecture/08-platform.md](../architecture/08-platform.md) — Environments topology.
- **Revisit threshold:** 3+ contributors, *or* external integrations (a customer, a vendor) need a stable non-prod URL, *or* compliance/auditor needs a UAT environment.
- **Upgrade path:** [recipes/staging-environment.md](../recipes/staging-environment.md).

### Native platform envs over centralized secrets manager

- **Constraint:** With 1-3 contributors, secret rotation is infrequent enough that platform dashboards suffice. Adding Doppler / Infisical / 1P adds tooling everyone must install.
- **Decision location:** [architecture/08-platform.md](../architecture/08-platform.md) — Env & secrets management.
- **Revisit threshold:** 3+ contributors, *or* monthly secret rotation cadence. (Cross-referenced with [budget.md](./budget.md).)
- **Upgrade path:** `recipes/secrets-doppler.md`, `recipes/secrets-infisical.md`, `recipes/secrets-1password.md`.

### No on-call rotation tooling

- **Constraint:** A solo founder doesn't need PagerDuty / Opsgenie / Better Stack on-call. Wiring it in the template means every derived project boots with an unconfigured rotation.
- **Decision location:** [architecture/06-observability.md](../architecture/06-observability.md) — scope boundary.
- **Revisit threshold:** team has 4+ engineers carrying production responsibility, *or* an SLA commits to <X-minute response.
- **Upgrade path:** out of template scope. Derived projects pick a vendor and wire it.

### Squash-merge with one-PR-author Changeset

- **Constraint:** Few contributors can coordinate Changesets per-PR without process overhead.
- **Decision location:** [architecture/08-platform.md](../architecture/08-platform.md) — CI and releases (see also `apps/admin` per [03-auth.md](../architecture/03-auth.md)).
- **Revisit threshold:** 5+ contributors merging concurrently — Changesets stacking becomes a coordination problem; consider a merge queue.
- **Upgrade path:** GitHub merge queue; recipe TBD.

---

## What this document is NOT

- A headcount plan. The template doesn't prescribe team composition; it captures *which decisions assume small-team coordination* so derived projects with larger teams know what to override.
- A maturity gate. A 2-person team running production for 5 years has different needs than a 5-person team in week 1. Use these thresholds as prompts to revisit, not as hard rules.
