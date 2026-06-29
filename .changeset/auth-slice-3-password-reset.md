---
'@template/auth': minor
---

Auth slice 3 — forgot & reset password (recovery round-trip).

- Add `requestPasswordReset` flow function in `packages/auth/flows`. Always
  returns the same generic "if an account exists, we've sent a link"
  response whether the address is registered or not (ADR-0002 — no
  account-existence leak). Validation failures and Supabase errors
  collapse onto the same success shape so callers — and enumerators —
  cannot distinguish them.
- Add `updatePassword` flow function. Used by `/reset-password` after
  `/auth/confirm` has verified the recovery `token_hash` and written the
  Session cookies. Requires an existing Session; rejects with the same
  "link no longer valid" shape when none is present. On success the
  current device stays signed in and every OTHER Session for the User is
  revoked via `signOut({ scope: 'others' })` — issue #5 acceptance
  criterion. Supabase `weak_password` (HIBP) is surfaced as a clear
  invalid-input so the User can pick a different password.
- Add the shared `requestPasswordResetSchema` and `updatePasswordSchema`
  Zod schemas. `updatePasswordSchema` reuses the same policy length as
  sign-up.
- Add `AUTH_MESSAGES.recoveryRequested`, `passwordUpdated`, and
  `recoverySessionMissing` for the new copy paths.
- New exports: `requestPasswordReset`, `updatePassword`,
  `requestPasswordResetSchema`, `updatePasswordSchema`, and the
  corresponding result / input / options types.
