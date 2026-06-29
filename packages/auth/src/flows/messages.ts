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
} as const;
