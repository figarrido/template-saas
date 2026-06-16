# Feature flags

## Abstraction and provider

**Decision:** `packages/flags` exports an **OpenFeature** client. Reference provider is **PostHog** (see [06-observability](./06-observability.md)). Plan entitlements stay in `packages/billing` (see [04-billing](./04-billing.md)) and are structurally separate from flags.

**Architecture:**
- OpenFeature SDK is the call-site API. App code calls `flags.getBooleanValue('new_billing', false, evalCtx)` — provider is irrelevant to callers.
- `packages/flags` ships the OpenFeature client setup and a **PostHog provider adapter** as the reference. Derived projects can swap providers (LaunchDarkly, Statsig, env-only) by registering a different OpenFeature provider — no call-site changes.
- Targeting context (`evalCtx`) carries both `userId` and `orgId` (plus tenant-level attributes). PostHog group targeting on `orgId` releases to specific customers.

**Why OpenFeature over a custom wrapper:**
- Maintained by CNCF; provider adapters exist for almost every vendor.
- The actual surface used (`getBooleanValue`, `getStringValue`) is small even though the spec is broader.
- Swap-out path is real (LaunchDarkly, Statsig, Flagsmith, env-var, GrowthBook, ConfigCat).

**Tradeoffs:**
- OpenFeature is one more SDK with its own concepts (hooks, evaluators, providers). Most engineers haven't used it. README + a few usage examples cover the gap.

**Related:** [04-billing](./04-billing.md), [06-observability](./06-observability.md)

---

## Evaluation

**Decision:** Server-side primary, client-side available, bootstrapped to avoid hydration flash.

- **Server-side primary.** Flags evaluated in Next.js Server Components or route handlers; results bootstrapped into client components so there's no hydration flash.
- **Client-side eval available** for client-only flows (experiments where the bucket changes per interaction). Client SDK initialized with bootstrapped values to avoid the first-eval network call.
- **Workers** (`services/*`) evaluate server-side with worker-context (`userId`/`orgId` from the job payload).

**Tradeoffs:**
- PostHog flag evaluation has latency considerations. Local evaluation via the Node SDK (downloads flag config periodically) is the right pattern for workers and server-side eval; client-side relies on bootstrap to avoid the network hop. Documented in the package README.
- Group targeting in PostHog requires `groupIdentify` calls for orgs — easy to forget. The auth helpers in `packages/auth` make this automatic when a user authenticates with an active org context.

---

## Overrides (dev / QA / staging)

**Decision:** Three override layers with explicit precedence.

- **Env-var override** — `FF_OVERRIDE_<flag_name>=true|false|<json>`. Loaded by the flags client at boot. Highest precedence after admin-UI. Use case: local dev, CI test runs.
- **URL parameter override** — `?ff_<flag_name>=true`. Cookie-stored after first set. Use case: quick QA on any environment. **Disabled in production** by an env var (overrides remain available in staging/dev).
- **Admin UI override** — `apps/admin` ships a flag-override view that forces a flag state for a specific user or org. Persists in DB (`flag_overrides` table), audited via `admin_audit_log` (see [03-auth](./03-auth.md)). Use case: pinning a specific customer for support, demos, or incident response.
- **Precedence:** admin-UI > env-var > URL > provider value > default.

**Tradeoffs:**
- Three override layers is more machinery than env-var alone. The admin UI override is the most complex piece (DB table, admin route, audit log entry). It's the highest-value layer for production support, so worth shipping.
- **Override precedence has a security surface.** URL-param override in production is a footgun if a staff user shares a link with a customer. The env-var gate that disables URL overrides in production is mandatory; admin-UI overrides remain auditable.

**Related:** [03-auth](./03-auth.md)

---

## Separation from entitlements

**Decision:** Flags and entitlements are structurally separate concerns.

- **Entitlements** = "this org has paid for or been granted access to feature X." Authoritative grant tied to billing state, lives in `packages/billing` (see [04-billing](./04-billing.md)). Mistoggling here = legal/contractual issue.
- **Flags** = "is feature X enabled for this caller right now (rollout %, experiment bucket, kill switch)." Lives in `packages/flags`. Mistoggling here = a UX bug.

A typical gated feature checks both: `if (entitlements.has('pro') && flags.isOn('new_dashboard')) { ... }`. The composition helper in `packages/flags` makes this explicit and lintable. The helper accepts the entitlements API by **injection** — `packages/flags` does not import `packages/billing`.

**Why the split:**
- Prevents the common mistake of using flags as paywall (a flag mistoggle silently giving away paid features) or using entitlements as rollout control (a billing event being the thing that ships a feature).

**Related:** [04-billing](./04-billing.md)
