// Shared ADR-0003 re-authentication helpers for the signed-in surfaces
// (change-password, change-email). Both surfaces gate sensitive mutations
// behind the same trio: fetch the current User, reject OAuth-only Users so
// the UI can route them to the recovery flow (story 41), then verify the
// current password via a silent `signInWithPassword`. Lives here so the two
// flows share one definition — mirrors the existing extraction pattern in
// `errors.ts` (`isWeakPasswordError`) and `identity.ts` (`hasEmailIdentity`).

import { hasEmailIdentity } from './identity.js';
import { AUTH_MESSAGES } from './messages.js';
import type { AuthClient } from './types.js';

export type AuthenticatedUser = {
  id: string;
  email: string;
  identities?: Array<{ provider?: string }> | null;
};

export type GetAuthenticatedUserResult =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; error: string; code: 'unexpected' };

/**
 * Fetch the currently signed-in User. Returns `unexpected` if the call
 * fails or yields no email — both signal a missing/expired Session, which
 * a signed-in surface should never see in normal use.
 *
 * Returned separately from `reauthenticateUser` because `changeEmail`
 * needs the User's current email to bail on a same-as-current input
 * BEFORE burning the silent re-auth round-trip.
 */
export async function getAuthenticatedUser(
  client: AuthClient,
): Promise<GetAuthenticatedUserResult> {
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user?.email) {
    return { ok: false, error: AUTH_MESSAGES.unexpected, code: 'unexpected' };
  }
  return { ok: true, user: data.user as AuthenticatedUser };
}

export type ReauthenticateResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      code: 'no-password-identity' | 'invalid-credentials';
    };

/**
 * Verify the current password for a signed-in User (ADR-0003). Returns:
 *
 * - `no-password-identity` if the User has no `provider: 'email'` Identity
 *   linked — they have no password to verify against. The UI uses this
 *   code to route them to the recovery flow (story 41).
 * - `invalid-credentials` (with the generic `reauthFailed` copy) for any
 *   `signInWithPassword` failure. Mapping every failure onto a single
 *   shape keeps the wrong-current-password branch indistinguishable from
 *   any other re-auth failure.
 *
 * On success Supabase refreshes the Session for the same User — a no-op
 * from the UI's perspective.
 */
export async function reauthenticateUser(
  client: AuthClient,
  user: AuthenticatedUser,
  currentPassword: string,
): Promise<ReauthenticateResult> {
  if (!hasEmailIdentity(user)) {
    return {
      ok: false,
      error: AUTH_MESSAGES.noPasswordIdentity,
      code: 'no-password-identity',
    };
  }

  const { error } = await client.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });

  if (error) {
    return {
      ok: false,
      error: AUTH_MESSAGES.reauthFailed,
      code: 'invalid-credentials',
    };
  }

  return { ok: true };
}
