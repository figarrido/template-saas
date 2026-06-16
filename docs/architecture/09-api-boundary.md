# API boundary

## Server Actions vs. Route Handlers

**Decision:** Hybrid. **Server Actions** for mutations in `apps/web` and `apps/admin`. **Route Handlers** for inbound webhooks, cron-triggered endpoints, and any cross-origin or public API surface. **No tRPC.**

**Why:**
- Server Actions are App Router-native, integrate with RSC, handle forms cleanly, and give end-to-end type safety via TS inference.
- Webhooks need Route Handlers for raw-body signature verification (see [04-billing](./04-billing.md)), and public APIs need standard HTTP semantics Server Actions don't expose.
- tRPC's value proposition (type-safe RPC) is subsumed by Server Actions + RSC in App Router. Adding it is duplicate machinery.

**Tradeoffs:**
- Server Actions are still maturing — error boundaries, optimistic UI patterns, progressive enhancement have rough edges. Acceptable; the App Router bet in [01-stack](./01-stack.md) already accepts this.
- Public API path requires a separate decision when needed: OpenAPI-described Route Handlers, or a thin adapter. Recipe: [recipes/public-api.md](../recipes/public-api.md).

**Related:** [01-stack](./01-stack.md), [04-billing](./04-billing.md), [07-frontend](./07-frontend.md)

---

## Rate limiting

**Decision:** Per-tenant token-bucket enforced in **Next.js middleware**, backed by **Upstash Redis** via `@upstash/ratelimit`.

Upstash chosen per [constraints/budget](../constraints/budget.md); the recipe covers a vendor-free fallback.

### Architecture

- Two key shapes by default:
  - `auth:<ip>` for unauthenticated routes (signup, login, password reset). Strict (~5/min).
  - `api:<orgId>` for authenticated routes. Generous (~600/min default; per-tenant tier-aware via [entitlements](./04-billing.md#entitlements-read-api)).
- Webhooks skip rate limiting — signature verification is the protection, and providers expect 200s.
- Per-route overrides via a `withRateLimit({ family, ... })` Route Handler wrapper.
- Edge-runtime-compatible; REST-based so no connection pooling concerns from Vercel functions.

**Why Upstash:**
- Edge-compatible and Vercel-native.
- `@upstash/ratelimit` no-ops cleanly when keys are absent — local dev works without an Upstash account.

**Tradeoffs:**
- Adds an Upstash account to the prod prereq list. Mitigated by no-op mode locally and by the recipe below.

**Recipe:**
- [recipes/rate-limit-pgmq.md](../recipes/rate-limit-pgmq.md) — Postgres-backed alternative for vendor-free derived projects.

**Related:** [04-billing](./04-billing.md), [06-observability](./06-observability.md), [../constraints/budget](../constraints/budget.md)

---

## CORS & API access controls

**Decision:** **Same-origin by default.** No CORS headers on Server Actions or Route Handlers used by the template's own apps. Public API surface doesn't exist in the template; recipe covers the build when needed.

### Defaults

- Server Actions are same-origin by construction.
- Route Handlers consumed by the template's own apps: same-origin; no CORS.
- Webhooks: no CORS (providers don't send preflights).

### Public API path (recipe)

- [recipes/public-api.md](../recipes/public-api.md) — `withCors({ origins, methods })` Route Handler wrapper, API key auth via an `api_keys` table, versioning convention (`/api/v1/...`), and integration with the rate-limit tier system.

**Tradeoffs:**
- Derived projects with mobile clients (React Native) or third-party integrations need the recipe on day one. Consistent with [README scope](./README.md#scope-what-is-not-in-the-template).

**Related:** [README](./README.md), [04-billing](./04-billing.md)
