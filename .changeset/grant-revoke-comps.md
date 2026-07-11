---
'@template/billing': minor
---

Comp write path (ADR 0007). Adds `grantComp` (expand a Plan via
`plan_entitlements` into `source='grant'` ledger period rows), `revokeComp`
(close the plan's active grant periods by setting `expires_at=now()`), and
`listActiveComps` (active Comps grouped by Plan) to `@template/billing/entitlements`.
Append/close only — billing- and seed-sourced periods are never touched.
