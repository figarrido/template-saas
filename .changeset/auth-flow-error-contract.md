---
'@template/auth': patch
---

Concentrate the flow error contract in `flows/errors.ts`. The two predicates that lived inline in their flows (`isNotConfirmedError`, `isSessionMissingError`) move in next to the shared ones, and three result shapers are introduced: `weakPasswordResult` (the flow-invariant weak-password mapping, previously copied across sign-up / change-password / update-password) and the named validation policies `invalidInputGeneric` / `invalidInputFirstIssue`. Silent-success validation (request-password-reset, resend-verification) deliberately stays inline in its flows. Behavior-preserving — all flow results are byte-identical.
