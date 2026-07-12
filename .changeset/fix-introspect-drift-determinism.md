---
'@template/db': patch
---

Make `db:introspect:check` deterministic under drizzle-kit 0.31. The 0.28→0.31
bump introduced two fresh non-determinisms the earlier member-sort fix didn't
cover: (1) 0.31 races its parallel catalog fetches and captures a policy's RLS
`using` / `withCheck` predicate on some runs but not others, and (2) it switched
the table extra-config from the `return { … }` object form to the `(table) => [
… ]` array form, which the member sort no longer touched — so array entries
flapped position by Postgres OID order. `patchIntrospectOutput` now canonicalises
every `pgPolicy` to a minimal `{ as, for, to }` shape (dropping the volatile
predicates — RLS behaviour stays covered by `test:rls`) and sorts array-form
members, so `db:introspect` and the drift check produce identical output on every
machine. `schema.ts` regenerated accordingly.
