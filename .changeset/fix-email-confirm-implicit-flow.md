---
'@template/auth': patch
'@template/db': patch
---

Fix email confirmation links erroring during a double-confirm email change.
Email one-time links are PKCE tokens that require the initiating browser's
single-use `code_verifier`, which two links (or a link opened on another
device) cannot satisfy — the second failed with `otp_expired`. `/auth/confirm`
now uses the implicit flow via a new optional `flowType` on `getUserClient`,
and `verifyEmailToken` treats a no-error/no-user `email_change` result as a
valid partial confirmation. OAuth keeps PKCE via `/auth/callback`.
