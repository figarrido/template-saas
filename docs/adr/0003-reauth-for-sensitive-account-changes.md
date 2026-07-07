# Re-authentication required for sensitive account changes

Changing password or email requires the User to re-enter their **current password**, verified by a silent `signInWithPassword(currentEmail, currentPassword)` immediately before the `updateUser()` call. Supabase's `updateUser({ password })` / `updateUser({ email })` do **not** require the current password by default, so a session left open on a shared machine could change the password (locking out the owner) or hijack the account email with no proof of identity. The current-password gate closes that hole with no email round-trip, and one shared re-authentication helper serves both flows.

## Considered Options

- **Supabase `reauthenticate()` nonce** — emails a one-time nonce that `updateUser` then requires (the `secure_password_change` path). Proves email control too, but adds an email step to every password/email change. Rejected as the default for the friction; derived projects needing the stronger guarantee can switch to it.
- **No re-auth** (Supabase's raw default) — rejected: the unattended-session takeover is exactly what a template should not ship.

## Session revocation on password change

A successful **password change** revokes every *other* Session for the User: after `updateUser({ password })` the flow calls `signOut({ scope: 'others' })`. The changing device stays signed in (it just re-authenticated); every other device is torn down on its next refresh. This matches the reset-password flow (`updatePassword`), where the same revocation already ships — a password change is the canonical "lock every other device out" action, so both password-setting paths behave identically. The revocation is best-effort: the password is already changed when it runs, so a failure there still reports success, and a stale Session elsewhere dies on its next refresh regardless.

**Email change does not revoke Sessions.** A Session is keyed to the User (`user_id`), not the email address, so a change of address is not a credential-rotation event. The secure double-confirm ([issue #7]) already proves control of both the old and new mailboxes before the change applies, so there is no takeover to invalidate. Derived projects with a stricter posture can add a revocation there, but the template does not.

## Consequences

- "Current password" becomes a required field on the change-password and change-email forms, and a shared `reauthenticate` helper wraps the silent sign-in. A mismatch returns a generic error (consistent with [ADR 0002](0002-account-enumeration-posture.md)).
- This gate is for password-holding Users. A User with only an OAuth Identity and no password ([ADR 0004](0004-auto-link-identities-on-verified-email.md)) cannot satisfy it — such a User must set a password first (via the recovery flow), which derived projects should account for if they expose these screens to OAuth-only Users.
- Changing the password signs the User out of all other devices; changing the email does not. A derived project that wants "re-login everywhere" on an email change opts in explicitly.
