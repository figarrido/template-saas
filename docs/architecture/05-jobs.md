# Background jobs & workers

## Queue substrate

**Decision:** Queue substrate is **Supabase Queues (pgmq)**. Scheduled enqueues use **`pg_cron`**. Runner ergonomics (typed payloads, retry policy, DLQ, dispatcher) come from a thin wrapper in `packages/jobs` (TS) with a mirrored Python module for the Python worker.

### Architecture

- **Producers:** Next.js apps enqueue via supabase-js calling `pgmq.send`. Inserts that need transactional enqueue use a Postgres function that wraps the write + `pgmq.send` in one call. Edge Functions and DB triggers can also enqueue directly — useful for event-driven flows (row insert → job) without app round-trips.
- **Consumers:** `services/worker-node` and `services/worker-py` each poll their assigned queues with `pgmq.read` (long-poll w/ visibility timeout), process, then `pgmq.delete` on success or let visibility expire on failure to trigger a retry.
- **Scheduled jobs:** `pg_cron` rows call `pgmq.send` on a schedule (replaces a Graphile-style built-in cron).

### `packages/jobs` exports

- The TS job-type contract (`defineJob`, typed payloads via Zod).
- A `runWorker` helper that codifies the retry curve, max-attempt → archive (DLQ via pgmq's archive table), structured logging, and Sentry capture.
- A registry that maps job name → queue name → handler.

### Retry policy

- **Default curve:** `30s / 2m / 10m / 1h / 6h`, max 5 attempts (~7.5h before archive). Bias: fast initial retries catch transient blips; long tail gives external systems time to recover.
- **Per-job override:** `defineJob({ ..., retry: { schedule: [...], maxAttempts: N } })`. Email-style jobs should DLQ within ~1h; external-API-dependent jobs can extend to days.
- **Implementation:** backoff = re-enqueue with delayed visibility (pgmq supports this directly). Attempt count read from pgmq's `read_ct`.
- **Python side:** `services/worker-py` mirrors the runner contract using `tembo-pgmq-python` + Pydantic schemas generated from the TS Zod types (JSON Schema → datamodel-code-generator).

**Why:**
- pgmq is a first-class Supabase feature, language-neutral (works for both Node and Python workers using the same queue — Graphile Worker / pg-boss are Node-only and would force a separate queue for Python), and composes with `pg_cron`, RLS, and DB triggers.
- The cost is writing a thin runner layer; the benefit is one substrate for everything, with dashboard visibility inside Supabase.

**Tradeoffs:**
- **More glue code than a full job runner.** Graphile Worker would ship retry/backoff/cron config-driven; with pgmq we encode that policy in `packages/jobs`. ~200 lines of TS + a mirrored Python module. Tolerable, and keeps the runner aligned with template needs.
- **Younger ecosystem than Graphile Worker.** pgmq is solid (SQS-style semantics) but has less community tooling. Mitigation: keep the wrapper's API narrow so the substrate could be swapped (e.g., to SQS) without touching producers/consumers.
- **Postgres-backed queues hit a ceiling eventually.** Far beyond template needs. Migration path: swap the implementation behind `packages/jobs`.
- **Workers need direct DB access** for `pgmq.read`/`delete`. Service-role key lives in Railway env vars. Standard practice; rotate on a schedule (see [08-platform](./08-platform.md#secrets-management)). Consider scoping with a dedicated role that only has access to the queue schema + the specific tables each job needs.
- **Cross-language schema drift risk.** TS and Python both define the payload schema. Mitigation: TS Zod is the source of truth; Python schemas are generated in CI, not hand-written.

**Related:** [02-data](./02-data.md), [04-billing](./04-billing.md), [06-observability](./06-observability.md), [08-platform](./08-platform.md)

---

## Worker health checks & graceful shutdown

**Decision:** Each worker exposes a tiny `GET /health` endpoint bound by `runWorker`. Railway polls it. SIGTERM triggers a configurable graceful drain.

**Mechanics:**
- **Health endpoint:** returns 200 if (a) DB reachable and (b) last-poll timestamp within a threshold; 503 otherwise.
- **SIGTERM behavior:** `runWorker` stops new `pgmq.read` calls, drains in-flight handlers up to `SHUTDOWN_GRACE_SECONDS` (default 30s), then exits.
- **No job loss:** in-flight jobs that exceed the grace period have their pgmq visibility expire and are retried by another worker. The visibility timeout *is* the safety net.
- **Python parity:** `services/worker-py` mirrors the contract with `asyncio` signal handlers.
- Documented in each worker's README alongside Railway's deploy-timeout guidance.

**Why:**
- Without a health endpoint, Railway can't distinguish a wedged worker from a slow one.
- Without graceful shutdown, every deploy briefly drops in-flight jobs into retry territory, doubling work.

**Tradeoffs:**
- Workers carry a minimal HTTP server they wouldn't otherwise need. ~20 lines per runtime; worth it for the health signal and a place to add metrics later.

**Related:** [08-platform](./08-platform.md)
