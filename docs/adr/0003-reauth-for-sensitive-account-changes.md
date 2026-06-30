# Re-authentication required for sensitive account changes

Changing password or email requires the User to re-enter their **current password**, verified by a silent `signInWithPassword(currentEmail, currentPassword)` immediately before the `updateUser()` call. Supabase's `updateUser({ password })` / `updateUser({ email })` do **not** require the current password by default, so a session left open on a shared machine could change the password (locking out the owner) or hijack the account email with no proof of identity. The current-password gate closes that hole with no email round-trip, and one shared re-authentication helper serves both flows.

## Considered Options

- **Supabase `reauthenticate()` nonce** — emails a one-time nonce that `updateUser` then requires (the `secure_password_change` path). Proves email control too, but adds an email step to every password/email change. Rejected as the default for the friction; derived projects needing the stronger guarantee can switch to it.
- **No re-auth** (Supabase's raw default) — rejected: the unattended-session takeover is exactly what a template should not ship.

## Consequences

- "Current password" becomes a required field on the change-password and change-email forms, and a shared `reauthenticate` helper wraps the silent sign-in. A mismatch returns a generic error (consistent with [ADR 0002](0002-account-enumeration-posture.md)).
- This gate is for password-holding Users. A User with only an OAuth Identity and no password ([ADR 0004](0004-auto-link-identities-on-verified-email.md)) cannot satisfy it — such a User must set a password first (via the recovery flow), which derived projects should account for if they expose these screens to OAuth-only Users.
