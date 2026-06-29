// Shared identity predicates over the supabase-js User shape. Lives here so
// change-password and change-email share one definition of "can this User
// satisfy the re-auth gate".

/**
 * True when the User has at least one `provider: 'email'` linked Identity —
 * i.e. an email/password account that can satisfy the ADR-0003 re-auth gate.
 *
 * Supabase exposes the provider on each linked Identity. An email/password
 * account always has at least one `provider: 'email'` entry; an OAuth-only
 * User does not. `identities` is optional in the SDK type — treat missing
 * as "we can't tell" and fall through to letting Supabase reject the
 * re-auth (which lands on the generic invalid-credentials branch).
 */
export function hasEmailIdentity(user: {
  identities?: Array<{ provider?: string }> | null;
}): boolean {
  const identities = user.identities ?? [];
  if (identities.length === 0) return true;
  return identities.some((identity) => identity.provider === 'email');
}
