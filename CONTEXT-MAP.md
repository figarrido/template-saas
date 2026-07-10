# Context Map

This repo is **multi-context**. Today there is one *resolved* context — the shared platform glossary at [`CONTEXT.md`](./CONTEXT.md), covering the vocabulary used across every surface (auth, billing, jobs, observability, tenancy). Per-surface contexts are added **lazily**: when a surface develops vocabulary that genuinely diverges from the shared glossary, `/domain-modeling` creates a `CONTEXT.md` beside that surface and registers it here.

## Contexts

- [Platform (shared)](./CONTEXT.md) — cross-cutting domain language for the whole template: User / Identity / Member / Operator, Organization / Role, Billing (Charge / Invoice / Subscription / Plan / Entitlement), and the four Provider roles. Owned at the root because these terms are shared by every app and service.

### Candidate contexts (not yet split)

Listed so future glossaries land in consistent places. A candidate becomes a *real* context only once it has a `CONTEXT.md` of its own; until then its vocabulary lives in the shared glossary above.

- `apps/web` — end-user surface
- `apps/admin` — Operator backoffice
- `services/worker-node`, `services/worker-py` — async job processing
- `packages/*` — provider-agnostic libraries (`auth`, `billing`, `jobs`, `flags`, …)

## ADRs

- Root [`docs/adr/`](./docs/adr/) holds **system-wide** decisions (current: `0001`–`0007`).
- When a context gets its own `CONTEXT.md`, context-specific decisions live in a `docs/adr/` beside it (e.g. `apps/web/docs/adr/`).

## Relationships

- `apps/web` and `apps/admin` never import each other; they share via `packages/*`. Cross-surface vocabulary therefore stays in the shared Platform glossary rather than being duplicated per app.
