// User-facing strings for the auth flows. Centralized so ADR-0002's
// account-enumeration mapping lives in exactly one place: any sign-in
// failure that isn't "correct password but unconfirmed account" surfaces
// the single generic message; the unconfirmed branch surfaces its own copy
// alongside a resend affordance.

export const AUTH_MESSAGES = {
  invalidCredentials: 'Invalid email or password.',
  notConfirmed: 'Email not confirmed. Check your inbox or resend the confirmation link.',
  invalidInput: 'Invalid email or password.',
  unexpected: 'Something went wrong. Please try again.',
  resendSent:
    "If that account exists and isn't confirmed yet, we've sent a new confirmation email.",
  // Sign-up always returns this generic interstitial copy — the same shape
  // for fresh sign-ups and already-registered emails (ADR-0002).
  checkYourEmail:
    "Check your email. If you can sign up with that address, we've sent a confirmation link.",
  weakPassword:
    'Choose a different password — this one is too easy to guess or has appeared in known breaches.',
  confirmLinkInvalid:
    'This confirmation link is no longer valid. Request a new one to keep going.',
  // Forgot-password always returns this generic message so the form can't
  // be used to enumerate accounts (ADR-0002). Same shape whether the
  // address is registered or not.
  recoveryRequested:
    "If an account exists for that email, we've sent a password reset link.",
  // Reset-password success copy. The current Session is preserved on this
  // device; every other Session for the User is revoked.
  passwordUpdated: 'Your password has been updated.',
  // Reset-password landed with no recovery Session — the link was already
  // consumed or the User came in from elsewhere.
  recoverySessionMissing:
    'This password reset link is no longer valid. Request a new one to keep going.',
  passwordChanged: 'Password updated.',
  // Re-auth gate (ADR-0003) — surfaced on both the wrong-current-password
  // branch and any other re-auth failure, so the response shape doesn't leak
  // which branch we hit.
  reauthFailed: 'Current password is incorrect.',
  // Stable copy for an OAuth-only User who has no password Identity to
  // re-authenticate against. The UI pairs it with a "set a password" link
  // to the recovery flow (story 41).
  noPasswordIdentity:
    'Your account does not have a password yet. Set one via the password-reset flow to continue.',
  // Change-email success copy. With `double_confirm_changes = true` Supabase
  // sends a confirmation link to BOTH the old and new addresses; the change
  // is only applied once both are clicked. Until then the User can still
  // sign in with the old email.
  emailChangeRequested:
    "Check both inboxes. We've sent a confirmation link to your current and new email addresses — open both to complete the change.",
  // The User typed their existing address as the "new" one. Bail before
  // hitting Supabase so the form gives an actionable error instead of a
  // silent no-op.
  emailUnchanged: 'New email is the same as your current email.',
  operatorInviteInvalidEmail: 'Enter a valid email address.',
  operatorAlreadyActive: 'That email already belongs to an Operator.',
  operatorInviteInvalid: 'This invitation link is no longer valid.',
} as const;
