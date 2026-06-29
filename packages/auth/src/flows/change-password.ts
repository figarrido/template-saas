import { changePasswordSchema, type ChangePasswordInput } from '../schemas.js';
import { isWeakPasswordError } from './errors.js';
import { hasEmailIdentity } from './identity.js';
import { AUTH_MESSAGES } from './messages.js';
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

  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData?.user?.email) {
    return { ok: false, error: AUTH_MESSAGES.unexpected, code: 'unexpected' };
  }

  if (!hasEmailIdentity(userData.user)) {
    return {
      ok: false,
      error: AUTH_MESSAGES.noPasswordIdentity,
      code: 'no-password-identity',
    };
  }

  // Silent re-auth — same user, same client. On success Supabase refreshes
  // the Session for the same User, which is a no-op from the UI's POV.
  const { error: reauthError } = await client.auth.signInWithPassword({
    email: userData.user.email,
    password: parsed.data.currentPassword,
  });

  if (reauthError) {
    return {
      ok: false,
      error: AUTH_MESSAGES.reauthFailed,
      code: 'invalid-credentials',
    };
  }

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

  return { ok: true, data: { message: AUTH_MESSAGES.passwordChanged } };
}
