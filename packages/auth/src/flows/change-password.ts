import { changePasswordSchema, type ChangePasswordInput } from '../schemas.js';
import { isWeakPasswordError } from './errors.js';
import { AUTH_MESSAGES } from './messages.js';
import { getAuthenticatedUser, reauthenticateUser } from './reauth.js';
import type { ActionResult, AuthClient } from './types.js';

export type ChangePasswordResult = ActionResult<{ message: string }>;

/**
 * Change a signed-in User's password.
 *
 * ADR-0003 (Re-authentication for sensitive account changes): the current
 * password is verified by a silent `signInWithPassword` against the
 * authenticated User's email before `updateUser` is called. A mismatch
 * returns a single generic error — the same response shape as any other
 * re-auth failure, so the call site can't distinguish them.
 *
 * A User whose only Identity is OAuth (no `provider: 'email'`) cannot
 * satisfy the re-auth gate; the flow short-circuits with
 * `no-password-identity` so the UI can route them to the recovery flow
 * (story 41) instead of letting them hit a dead end.
 *
 * The new password is held to the same policy as sign-up (length client-
 * side; HIBP server-side via Supabase). `weak_password` is surfaced as
 * `invalid-input` with the Supabase-provided message so the User can pick
 * a different one.
 *
 * On success every OTHER Session for the User is revoked (`scope: 'others'`),
 * matching the reset-password flow (`updatePassword`). A password change is
 * the canonical "lock every other device out" action, so this device stays
 * signed in and all others are torn down. See ADR-0003.
 */
export async function changePassword(
  client: AuthClient,
  input: ChangePasswordInput,
): Promise<ChangePasswordResult> {
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? AUTH_MESSAGES.invalidInput,
      code: 'invalid-input',
    };
  }

  const authResult = await getAuthenticatedUser(client);
  if (!authResult.ok) return authResult;

  const reauthResult = await reauthenticateUser(
    client,
    authResult.user,
    parsed.data.currentPassword,
  );
  if (!reauthResult.ok) return reauthResult;

  const { error: updateError } = await client.auth.updateUser({
    password: parsed.data.newPassword,
  });

  if (updateError) {
    if (isWeakPasswordError(updateError)) {
      return {
        ok: false,
        error: updateError.message || AUTH_MESSAGES.weakPassword,
        code: 'invalid-input',
      };
    }
    return { ok: false, error: AUTH_MESSAGES.unexpected, code: 'unexpected' };
  }

  // Revoke every OTHER Session for this User (ADR-0003) — the same posture
  // the reset-password flow takes. Keeping `scope: 'others'` leaves the
  // current device signed in (it just re-authenticated) and tears down every
  // other Session. Best-effort: the password change already succeeded, so a
  // failure here still reports success; a stale Session elsewhere dies on its
  // next refresh regardless.
  await client.auth.signOut({ scope: 'others' });

  return { ok: true, data: { message: AUTH_MESSAGES.passwordChanged } };
}
