# Observability

## Error tracking (application layer)

**Decision:** **Sentry** for error tracking in all three runtimes (`apps/web`, `apps/admin`, `services/worker-node`, `services/worker-py`). Sentry consumes OpenTelemetry spans so application errors and traces share IDs with the log-correlation story below.

**Why:**
- Default pick for a modern SaaS template.
- Sentry's OTel support (first-class as of 2024) means no double instrumentation.

**Tradeoffs:**
- Sentry across runtimes means multiple SDK installs and DSNs. Upfront config cost; payoff is unified release tracking.

**Related:** [07-frontend](./07-frontend.md), [05-jobs](./05-jobs.md)

---

## Product analytics

**Decision:** **PostHog Cloud.** Client-side autocapture in `apps/web` plus server-side event tracking from API routes and workers. PostHog also serves as the reference feature-flag provider (see [10-feature-flags](./10-feature-flags.md)).

**Why:**
- Default pick for product analytics; doubles as the flags provider so the template integrates one SDK for two concerns.
- Self-hosted not planned; if data residency becomes a requirement later, PostHog supports migration.

**Tradeoffs:**
- Cloud dependency. Documented; self-host is the escape hatch.

**Related:** [10-feature-flags](./10-feature-flags.md)

---

## Operational observability

**Decision:** `packages/observability` ships logger setup (Pino + structlog), standard structured fields, and **OpenTelemetry**-based trace context propagation across all surfaces. Default log transport is **JSON to stdout**; the template is vendor-neutral and ships connection recipes for Better Stack, Axiom, Grafana Cloud, and Datadog.

Vendor choice for log aggregation is deferred per [constraints/budget](../constraints/budget.md). Uptime, status pages, and on-call rotation are out of scope; see [constraints/team](../constraints/team.md).

### Scope boundary

- **In scope:** structured logging, log-field conventions, trace correlation, request/job context propagation, recipes for shipping logs to aggregators.
- **Out of scope:** uptime synthetic checks, public status pages, on-call rotation tooling. These are product-org decisions tied to team size; see [constraints/team](../constraints/team.md). The template's job is to make the logs they consume rich enough to be useful.

### Logger config (`packages/observability`)

- **Node side:** Pino preconfigured with standard fields, JSON output, async destination.
- **Python side:** structlog preconfigured with matching field names and JSON output (worker-py emits the same shape).
- **Standard fields on every log line:**
  - `service` — `web` / `admin` / `worker-node` / `worker-py`
  - `env` — `production` / `staging` / `dev`
  - `request_id` — for HTTP requests
  - `job_id` — for queue jobs
  - `org_id`, `user_id` — when authenticated
  - `trace_id`, `span_id` — from OpenTelemetry context (see below)
  - `release` — Git SHA, populated at build time
- **Context propagation:** `withContext()` helper in TS, `bind_contextvars()` pattern in Python. Once context is set at the boundary (request handler, job consumer), every subsequent log line in that scope carries the context fields.
- **PII rules:** logger ships with a redactor configured for known sensitive fields (`password`, `token`, `secret`, `authorization`, `cookie`). Documented as a starting point — derived projects add domain-specific redactions.

### Trace correlation via OpenTelemetry

- OTel SDK initialized in Node (`@opentelemetry/sdk-node`) and Python (`opentelemetry-sdk`) in each surface. Provides `trace_id`/`span_id` to the logger via context propagation.
- **Sentry consumes OTel spans** — we get Sentry's transaction view *and* portable OTel traces with no double instrumentation.
- **Across the job queue boundary:** trace context is **serialized into the job payload** by the producer (Next.js enqueue) and **restored by the consumer** (`services/worker-*`) so a single trace spans request → enqueue → consume. Implemented in `packages/jobs` as part of `defineJob`/`runWorker`.
- **Across the HTTP boundary:** standard W3C `traceparent`/`tracestate` headers; works natively with Next.js + supabase-js + fetch.

### Default transport (stdout)

- All surfaces emit JSON to stdout. Vercel and Railway both surface stdout in dashboards (short retention) and both have log-drain integrations to external aggregators.
- No daemon, no sidecar, no buffer to manage.

### Connection recipes

- [recipes/observability-betterstack.md](../recipes/observability-betterstack.md)
- [recipes/observability-axiom.md](../recipes/observability-axiom.md)
- [recipes/observability-grafana-cloud.md](../recipes/observability-grafana-cloud.md)
- [recipes/observability-datadog.md](../recipes/observability-datadog.md)

**Why OTel over Sentry-only trace context:**
- Sentry's trace IDs propagate cleanly inside Sentry's tooling but aren't a portable standard — a log aggregator joining on `trace_id` only works if Sentry's IDs are usable as keys.
- OTel uses W3C trace context — works in every modern log aggregator, every APM tool, and through HTTP boundaries without bespoke code.
- Sentry consumes OTel spans natively, so we lose nothing on the Sentry side.
- Modest upfront cost (OTel SDK init in each surface) for substantially better portability and cross-tool correlation.

**Tradeoffs:**
- **stdout default + no aggregator = no cross-surface log search.** A derived project shipping to production without picking an aggregator is essentially blind beyond Vercel's/Railway's tiny retention windows. Recipes are mandatory reading, not optional.
- **OTel adds setup code in every surface.** Two SDKs (Node + Python), an init module per surface, context propagation wiring across the job queue. ~100 lines of plumbing. Worth it for the portability.
- **PII redactor is a starting point, not a complete solution.** Derived projects in regulated jurisdictions (healthcare, finance) need their own data-classification pass.
- **`apps/web` server-side logs are easy; `apps/web` client-side logs are harder.** Browser logs don't go to stdout. Sentry's browser SDK captures errors and PostHog captures behavior; raw browser console logs are not aggregated. Acceptable tradeoff.
- **Trace propagation across pgmq is custom code** (header serialization into the job payload). Documented and tested but a known weak point — any third party that processes the queue without going through `runWorker` would break trace continuity.

**Related:** [05-jobs](./05-jobs.md), [08-platform](./08-platform.md), [../constraints/budget](../constraints/budget.md), [../constraints/team](../constraints/team.md)

---

## Security headers + CSP

**Decision:** Static security headers in **`next.config.js` `headers()`**; **CSP in Next.js middleware** with a per-request nonce. Reporting goes to Sentry. Stricter CSP in `apps/admin` than `apps/web`.

### Headers (both apps)

- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()` (extend per product)

### CSP (in middleware, nonce-based)

- `default-src 'self'`
- `script-src 'self' 'nonce-<x>' <provider-domains>` (e.g., PostHog in `apps/web`)
- `connect-src 'self' <supabase> <posthog> <sentry>`
- No `unsafe-inline` / `unsafe-eval` except where strictly required (documented per exception).
- `report-to` + `report-uri` → Sentry endpoint.

### `apps/admin` differences

- No PostHog, no third-party analytics domains in `script-src` / `connect-src`.
- Tighter `frame-ancestors 'none'`. Internal surface; no embedding scenarios.

**Tradeoffs:**
- Strict CSP breaks third-party widgets that inject inline scripts. Each addition (Intercom, Stripe Checkout redirect, etc.) needs an explicit CSP entry. Documented in [recipes/csp-extensions.md](../recipes/csp-extensions.md).
- Nonce-based CSP requires middleware on every request — already true for [03-auth](./03-auth.md) (admin) and [10-feature-flags](./10-feature-flags.md) (URL-param flag overrides), so no incremental cost in `apps/admin`; small extra cost in `apps/web`.

**Related:** [03-auth](./03-auth.md), [09-api-boundary](./09-api-boundary.md)
