# Architecture

Decisions governing the SaaS template. One area per file. Each file is `Decision / Why / Tradeoffs / Related` so contributors can scan without reading prose.

This directory replaces the transitional `PROJECT_DEFINITIONS.md` (see §37 of that file).

---

## Guiding principles

These constrain every decision in this directory. When a decision seems to violate one, the decision is wrong, not the principle.

- **This is a template, not a product.** The first product built from the template is *context* for what abstractions need to exist, not a directive to bake product-specific code into the template.
- **Ship abstractions + one reference implementation, not concrete vendors.** Country-specific, jurisdiction-specific, or product-specific adapters live in derived projects, written against the template's interfaces. The template carries only what's needed to exercise and document the abstraction.
- **Optimize for "fast to add later," not "covers everything now."** Every concrete vendor adapter shipped is weight every derived project carries, audits, and updates. Prefer a well-shaped seam over a pre-built bridge.
- **Pick the most universal reference.** When the template needs *one* concrete example to validate an interface, pick the option with the widest applicability, best sandbox/test mode, and best docs — not the option most relevant to the first product.

---

## Scope (what is NOT in the template)

Explicit non-goals, called out so they don't sneak in as "while we're at it" work:

- Mobile clients (React Native / Expo).
- Internationalization beyond English copy.
- A design-token system beyond Tailwind defaults.
- Self-hosted deployment recipes.
- Provider-specific advanced billing features that don't generalize (Stripe Sigma, Paddle Retain, etc.) — addressable via the `providerMetadata` escape hatch in [04-billing](./04-billing.md) if needed, but not first-class.
- Country-specific billing adapters (Fintoc, Webpay, Openfactura, Bsale, etc.) — implemented in derived projects against the template's `BillingProvider` / `EmitterProvider` interfaces.
- SAML / OIDC SSO for enterprise customers — Supabase supports SAML; pricing/setup needs a derived-project decision.
- GDPR / data export / right-to-erasure tooling — significant surface; needs evaluation when a derived product hits a regulated market.

Deferred to derived projects:

- Chilean charging adapter pick (Fintoc / Webpay / both).
- E-invoicing emitter pick (Openfactura / Bsale / Haulmer / etc.).
- PII redaction policy beyond the default redactor.
- Uptime / status-page / on-call vendor — team-size decision; see [constraints/team](../constraints/team.md).
- Secrets-manager centralization (Doppler / Infisical / 1P) — team-size decision; see [constraints/team](../constraints/team.md).

---

## Index

| File | Covers |
|------|--------|
| [01-stack](./01-stack.md) | Stack baseline; admin vs. client app split |
| [02-data](./02-data.md) | Multi-tenancy + RLS; DB tooling; schema conventions; migration deploy order; testing |
| [03-auth](./03-auth.md) | Authentication; OAuth defaults; onboarding + invitations |
| [04-billing](./04-billing.md) | Provider-agnostic billing; entitlements read API |
| [05-jobs](./05-jobs.md) | Background jobs (pgmq); worker health + graceful shutdown |
| [06-observability](./06-observability.md) | Error tracking; structured logs + OTel; analytics; security headers + CSP |
| [07-frontend](./07-frontend.md) | UI library; email; forms; theming; folder structure |
| [08-platform](./08-platform.md) | Monorepo; non-Vercel hosting; env & secrets; environments topology; CI; Conventional Commits; dependency hygiene |
| [09-api-boundary](./09-api-boundary.md) | Server Actions vs. Route Handlers; rate limiting; CORS |
| [10-feature-flags](./10-feature-flags.md) | OpenFeature + PostHog; overrides; entitlements separation |
| [11-config](./11-config.md) | `packages/config` content; TypeScript strictness |
| [12-local-dev](./12-local-dev.md) | Local dev workflow |

Constraints (referenced by architecture docs, not embedded):

| File | Covers |
|------|--------|
| [../constraints/budget](../constraints/budget.md) | Budget posture; free-tier dependencies; revisit thresholds |
| [../constraints/team](../constraints/team.md) | Team-size assumptions; scaling thresholds |

---

## Format conventions

Each architecture doc follows:

```
# <Area>

## <Decision n>

**Decision:** ...

**Why:** ...

**Tradeoffs:** ...

**Related:** [01-stack](./01-stack.md), [02-data](./02-data.md#section)
```

Rules:

- **No budget or team-size reasoning embedded.** If a decision is driven by such a constraint, link to `constraints/budget.md` or `constraints/team.md` and state the threshold there.
- **Cross-references use relative links**, not "§N" references (PROJECT_DEFINITIONS.md's stable numbering retires with it).
- **Superseded sections** stay in place with `**SUPERSEDED →** [new section](./...)` at the top. Original content preserved for provenance.
- **Recipes** referenced by architecture docs live under [../recipes/](../recipes/) and are linked by relative path.

---

## Adding or changing a decision

- New decision → new section in the relevant file. Significant cross-cutting decisions can warrant a new file; update this index.
- Superseding a decision → add a new section, mark the old one `SUPERSEDED`, preserve content.
- Discussion → in the PR description. No separate RFC tooling.
