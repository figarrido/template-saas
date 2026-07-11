---
'@template/billing': minor
'@template/db': minor
---

Entitlements temporal-ledger foundation (ADR 0007).

- `entitlements` is now an append-only ledger of validity periods: `unique
  (organization_id, key)` dropped; `starts_at` + `granted_by` added; index
  `(organization_id, key, expires_at)` added for the temporal read.
- New `entitlement_key` Postgres enum (seeded `pro`); `entitlements.key` and
  the new `plan_entitlements (plan_id, key, value)` mapping are typed to it.
  `@template/db` now exports the `EntitlementKey` union.
- `has()`/`list()` treat a feature as active only while a period covers now();
  overlapping billing + grant periods coexist and `list()` dedupes per key with
  grant-wins on value conflict. New pure `resolveActiveEntitlements` export.
