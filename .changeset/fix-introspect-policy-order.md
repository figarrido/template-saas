---
'@template/db': patch
---

Make the Drizzle introspection drift check deterministic across containers.
`patchIntrospectOutput` already normalised table and relation order, but left
the members inside each `pgTable` block (constraints, indexes, and especially
RLS `pgPolicy` entries) in drizzle-kit's raw Postgres OID order — which differs
between a fresh CI container and a reset local one. `db:introspect:check` then
flagged spurious drift depending on which machine last generated `schema.ts`.
The patch now sorts each table block's members alphabetically, so both
`db:introspect` and the drift check produce identical output everywhere.
