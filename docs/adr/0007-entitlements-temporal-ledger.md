# Entitlements are an append-only temporal ledger

The `entitlements` table becomes an **append-only ledger of validity periods** — one immutable row per period, each carrying `starts_at` → `expires_at` — rather than a current-state projection with one row per `(organization_id, key)`. The `unique (organization_id, key)` constraint is **dropped**; `starts_at` and `granted_by` are **added**. An Organization "has" a feature when an active period covers `now()`. This **supersedes** `04-billing.md`'s framing of entitlements as a *"read-side projection"*: entitlements carry legal weight (*"a mistoggled Entitlement is a legal or contractual issue"*), and a projection that overwrites itself on every change cannot answer *"which feature did this Organization hold on date D, from what `source`, and granted by whom?"* — a ledger can, and the same shape lets billing subscriptions and Operator [Comps](0006-operator-access-model.md) coexist without ever clobbering each other.

Three lifecycle transitions, and only one of them mutates a row:

- **Renewal (paid period)** — **append** a new period row (`starts_at` = period start, `expires_at` = period end, `source='billing'`).
- **Cancellation** — **do nothing**; stop appending. The current period rides out to its natural `expires_at`, giving "keep service until end of period" for free.
- **Immediate termination** (chargeback/fraud, or an Operator pulling a Comp early) — **close the current period** by setting its `expires_at = now()`. This is the sole permitted mutation; `admin_audit_log` records who did it.

## Coexistence and precedence

Because uniqueness on `(org, key)` is gone, a billing subscription and an Operator Comp for the same key are simply **two overlapping active periods**. The read side ORs them: `has(org, key)` is true when *any* active period covers `now()`. Neither source can ever erase the other's rows — a billing lapse touches only `source='billing'` periods, a Comp revoke only `source='grant'` periods. On a **value** conflict (billing `seats=5`, Comp `seats=10`), the **Comp wins** — the Operator override is intentional.

## The `plan_entitlements` mapping

A Plan's *contents* — which feature keys it grants — live in a new **`plan_entitlements` (plan_id, key, value)** table, **developer-defined** in migrations/seed (not Operator-editable in this build; catalog management is a later addition). Both billing renewals and Operator Comps expand a Plan into concrete Entitlement period rows through this mapping. Because the concrete `key` is snapshotted onto each period row at grant time, later edits to a Plan's contents do **not** retro-change history.

## Entitlement keys are a closed, enum-backed set

`entitlements.key` and `plan_entitlements.key` are typed to a Postgres **`entitlement_key` enum**, not free `text`. The closed set is therefore enforced in the database (an undefined key cannot be inserted) and, because the repo already generates TS types from the schema (`pnpm db:types`), it is simultaneously a static string-literal union in code — giving `has(org, key)` compile-time safety and autocomplete with **no hand-written registry**. The template ships the enum seeded only with the reference `pro` key; a derived project adds features with `ALTER TYPE public.entitlement_key ADD VALUE …` in a migration (note: a newly-added value cannot be *used* in the same transaction it is added in, so any seed that references a new key belongs in a later migration).

This is deliberately a *different* mechanism from the RBAC `Action` set (a hand-written code union in `packages/auth`) and from flag keys (which would use a code registry). The rule is **the mechanism follows where the vocabulary is stored**: `Action` is never persisted (pure app logic → code union); an entitlement key lives in a DB column (→ DB enum, enforced exactly where the data is); a flag key lives in the external flag provider, not our DB (→ code registry). Each is a closed static set; each uses the mechanism matching its storage.

Enum rigidity *aligns* with the ledger: an enum value can never be removed, which is exactly what an append-only history needs — historical period rows must keep referencing their keys forever. Deprecating a feature means dropping it from `plan_entitlements` (stop granting it) while the enum value lives on for provenance.

**Marketing/presentation metadata stays out of these tables.** Display names, pricing-page copy, feature bullets, badges, and ordering are a separate, mkt-owned, frequently-changing concern; mixing them into the machine-truth tables that gate paid access is the wrong coupling. The template drives its reference pricing page from typed config in `apps/web`; a derived project whose marketing team needs self-serve editing wires a CMS or a separate `plan_marketing` table (keyed by plan slug) as a recipe. Per-key *labels* for the admin detail view live as a small code map in `packages/billing` until a derived project needs richer per-key metadata.

## Considered Options

- **Single row per key, overwritten (with precedence rules)** — fewest schema changes, but keeps no history and makes every monthly billing renewal a landmine that must be taught not to clobber a Comp. Rejected.
- **Composite `unique (org, key, source)`** — lets billing and Comp coexist as separate rows, solving the clobber problem, but still overwrites within a source and so still discards period history. Subsumed by the ledger, which delivers the same coexistence *and* the history.

## Consequences

- Forward-only migration (expand → dual-write → contract) to drop `unique (org, key)`, add `starts_at` + `granted_by`, and index `(organization_id, key, expires_at)` for the temporal read.
- The migration also defines the `entitlement_key` enum (seeded with `pro`) and types `entitlements.key` and `plan_entitlements.key` to it; `pnpm db:types` regenerates the matching TS union.
- `packages/billing` read API gains the temporal predicate (`starts_at <= now() AND (expires_at IS NULL OR expires_at > now())`), a `list()` dedupe across overlapping periods, and the grant-wins value rule.
- The table grows one row per period per key — bounded (monthly/yearly) and archivable; "current state" becomes a query, which apps already memoize per request.
- The billing→entitlement **writer stays a TODO seam** (out of scope here) but now has a precise spec: renew → append, cancel → stop, hard-kill → close early.
- Operator Comps (`source='grant'`, `granted_by` set, optional `expires_at`) are the write path this build ships, from the org detail page in `apps/admin`. Each Comp grant/revoke writes `admin_audit_log`.
- **Implementation must** update `04-billing.md` (projection → ledger) in the same change, per `CLAUDE.md`.
