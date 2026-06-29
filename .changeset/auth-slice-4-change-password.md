---
'@template/auth': minor
---

Auth slice 4 — change password with re-authentication gate.

- Add `changePassword` flow function in `packages/auth/flows` and the
  shared `changePasswordSchema` Zod schema. ADR-0003: the current
  password is verified by a silent `signInWithPassword` against the
  authenticated User's email before `updateUser`; mismatch returns a
  generic `invalid-credentials` error and `updateUser` is never called.
- The new password is held to the shared policy (length client-side via
  `passwordSchema`; HIBP enforced server-side by Supabase and surfaced as
  `invalid-input` with the provider message so the User can pick a
  different one).
- A User whose only Identity is OAuth (no `provider: 'email'`) short-
  circuits with a new `no-password-identity` error code so the UI can
  route them to the recovery flow (story 41) instead of letting them hit
  a dead end.
- New exports: `changePassword`, `changePasswordSchema`,
  `ChangePasswordInput`, `ChangePasswordResult`, plus the
  `no-password-identity` `ActionErrorCode`.
