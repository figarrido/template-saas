---
'@template/auth': minor
---

Auth slice 5 — change email with re-authentication gate + secure double-confirm.

- Add `changeEmail` flow function in `packages/auth/flows` and the shared
  `changeEmailSchema` Zod schema. ADR-0003: the current password is
  verified by a silent `signInWithPassword` against the authenticated
  User's email before `updateUser({ email })`; mismatch returns the same
  generic `invalid-credentials` error shape as `changePassword`, and
  `updateUser` is never called.
- Secure double-confirm (issue #7): `auth.email.double_confirm_changes`
  is already on in `supabase/config.toml`, so `updateUser({ email })`
  emits confirmation links to BOTH the old and the new address. The
  change applies only once both are clicked; the row's `email` is
  untouched until then, so the User can keep signing in with the old
  address. Both messages render through the existing send-email hook
  (React Email — ADR-0005), which already routes `email_change` to
  `VerifyEmail` with a "Confirm your new email address" subject.
- OAuth-only Users short-circuit with `no-password-identity` (story 41).
- `updateUser` errors — including `email_exists` — are mapped to the
  generic `unexpected` branch rather than echoed verbatim, so a signed-in
  attacker can't enumerate other Users' addresses (the ADR-0002 posture
  applies to authenticated surfaces too).
- New exports: `changeEmail`, `changeEmailSchema`, `ChangeEmailInput`,
  `ChangeEmailResult`, `ChangeEmailOptions`.
