# Billing

## Provider-agnostic billing layer

**Decision:** Provider-agnostic billing layer in `packages/billing`, with **charging** and **tax-document emission** modeled as two separate concerns. The template ships the abstractions plus **one reference charging adapter (Stripe)** and **zero emitter adapters**. Country-specific providers (Fintoc, Webpay, Openfactura, Bsale, etc.) are implemented in derived projects against the template's interfaces.

### Charging side

- `packages/billing` exports a provider-neutral domain model: `BillingAccount`, `Subscription`, `Plan`, `Price`, `Charge`, `PaymentMethod`, `UsageEvent`, and lifecycle events (`subscription.created`, `subscription.updated`, `subscription.canceled`, `charge.paid`, `charge.failed`, ...). The provider's own "Customer" object is adapter-internal and maps to a `BillingAccount` (the link between an Organization and one provider); "Customer" is not a domain term — the entity being billed is the Organization.
- A `BillingProvider` interface defines the operations: `createCheckoutSession`, `createCustomerPortalSession`, `getSubscription`, `cancelSubscription`, `reportUsage`, `verifyWebhook`, `normalizeWebhookEvent` (→ canonical domain event).
- Concrete adapters live in `packages/billing/providers/*`. The template ships `providers/stripe` as the reference; derived projects add their own (`providers/fintoc`, `providers/webpay`, ...) without modifying the package.
- A **provider registry + router** selects which provider to use per call. Routing inputs: the org's region/country, the rail type (bank transfer vs. card), the org's currently-attached provider account, an explicit override, or a feature flag. An org carries a `billing_accounts` table (one row per provider) so a single org can be connected to multiple providers simultaneously.
- Webhook ingress: one webhook route per provider (e.g., `/api/webhooks/billing/stripe`). Each route delegates to its adapter for verification and normalization, then emits the canonical event onto a single internal handler — business logic (granting entitlements, updating org state) is written once.

### Tax-document side (separate from charging)

- `Charge` (internal billing record) is **distinct** from `Invoice` (the legal e-invoice — boleta/factura in Chile, NF-e in Brazil, GST invoice in India, etc.).
- An `EmitterProvider` interface handles tax-document emission: `emit`, `void`, `getStatus`. **No concrete emitter ships in the template** — derived projects add what their jurisdiction needs.
- The canonical `billing.charge.paid` event triggers emission as a separate step. Charging adapter and emitter adapter are independently swappable.
- `Invoice` rows in the DB carry the legal document reference (folio/number), document type, status, and a link to the `Charge` they belong to. The schema and event flow are template-level; the actual emission is product-level.
- If a derived product is in a jurisdiction without e-invoicing mandates (e.g., US-only), it simply doesn't register an emitter — the seam exists but is unused, costing nothing.

### Plans and entitlements

- `plans` and `entitlements` tables live in the DB. Provider price IDs map *to* the internal plan IDs, not the reverse. This is what makes multi-provider feasible — a "Pro" plan is one row in the DB, with potentially many provider-specific price mappings.

**Why ship Stripe (and only Stripe) as the reference charging adapter:**
- Most universally-applicable charging provider; almost every derived product can use it for at least international/card payments.
- Best sandbox/test mode, which is what makes integration tests of the abstraction actually useful.
- Serves as the blueprint a derived project copies when implementing Fintoc, Webpay, Paddle, etc.
- Validates that the interface generalizes beyond a single vendor *before* derived projects start depending on it.

**Why no emitter ships in the template:**
- E-invoicing is jurisdiction-specific by definition. Even Openfactura — the likely first pick for Chilean derivatives — is the wrong default for a Brazilian or Mexican project.
- The `EmitterProvider` interface is ~30 lines. Once a derived project picks its jurisdiction, wiring an emitter is a day's work.

### Stability marker

- `packages/billing` is versioned `0.x.y` until the first derived project ships a second non-Stripe adapter (at which point Stripe-shaped assumptions in the interface will surface and the interface will be refactored).
- A `packages/billing/STABILITY.md` documents the policy. The package README warns derived projects to pin exact versions.
- After the first second-adapter refactor, bump to `1.0` and follow semver.

**Tradeoffs:**
- **Abstractions leak.** Providers diverge on proration, trials, tax handling, and metered billing semantics. The canonical model picks a lowest-common-denominator for core flows and exposes provider-specific extensions via a typed `providerMetadata` escape hatch.
- **The interface is only as good as the adapters that exercise it.** With just Stripe in the template, there's a real risk the abstraction encodes Stripe assumptions invisibly. Mitigation: when the *first* derived project adds its second adapter, expect to refactor the interface — and treat that as the moment the abstraction is actually validated.
- **Conformance test suite ships in the template.** Each adapter implements the same conformance suite. Without it, each new adapter is a discovery exercise.
- **Tax handling is provider-shaped.** Stripe is not a Merchant of Record (Stripe Tax helps but isn't MoR). The `EmitterProvider` layer is how derived products close that gap.
- **"Charge paid, Invoice emission failed"** is a real and legally-fraught state in any e-invoicing jurisdiction. The job-queue integration (see [05-jobs](./05-jobs.md)) handles emission retries durably with high max-attempts; the template ships a generic "needs manual intervention" admin view in `apps/admin` parameterized on `Invoice.status`.

**Related:** [02-data](./02-data.md), [05-jobs](./05-jobs.md), [09-api-boundary](./09-api-boundary.md)

---

## Entitlements read API

**Decision:** Lives in `packages/billing` as a sub-export — `import { entitlements } from '@template/billing/entitlements'`.

**Signature:**
- `entitlements.has(orgId: string, key: string): Promise<boolean>`
- `entitlements.list(orgId: string): Promise<Entitlement[]>`
- Per-request memoization via Next.js `cache()` wrapper on the server. Workers call directly without the cache wrapper.

**Why:**
- Entitlements are derived from billing state (plans, active subscriptions, manual grants). The source data lives in billing-adjacent tables; a separate `packages/entitlements` would either circular-import or be a thin wrapper.
- Not attached to the Org model: that would pull billing into `packages/db` and expand `packages/db`'s purpose beyond DB access.
- Sub-export (rather than top-level on `packages/billing`) keeps the entitlements API discoverable as its own concept while preserving the package boundary.

**Composition with flags:**
- The composition helper (`if (ents.has('pro') && flags.isOn('new_dashboard'))`) lives in `packages/flags` but accepts the entitlements API by **injection** — `packages/flags` does not import `packages/billing`. Prevents circular deps and keeps flags swappable in isolation. See [10-feature-flags](./10-feature-flags.md).

**Tradeoffs:**
- A derived project swapping the billing package wholesale (unlikely) also swaps entitlements. Acceptable; the API surface is small.
- Per-request cache means an entitlement granted mid-request isn't visible until the next request. Standard read-your-writes consideration; documented.

**Related:** [10-feature-flags](./10-feature-flags.md)
