import { updatePasswordSchema, type UpdatePasswordInput } from '../schemas.js';
import {
  invalidInputFirstIssue,
  isSessionMissingError,
  isWeakPasswordError,
  weakPasswordResult,
} from './errors.js';
import { AUTH_MESSAGES } from './messages.js';
import type { ActionResult, AuthClient } from './types.js';

export type UpdatePasswordResult = ActionResult<{ message: string }>;

/**
 * Set a new password for the User identified by the current Session.
 *
 * Used by the reset-password page after `/auth/confirm` has verified the
 * recovery `token_hash` and written the Session cookies. Requires an
 * existing Session — without one we cannot identify whose password to
 * change, so the call is rejected with the same "link no longer valid"
 * shape the User sees when the link itself has expired.
 *
 * On success the current device stays signed in (the Session cookies are
 * not cleared) and every OTHER Session for the User is revoked
 * (`scope: 'others'` — issue #5 acceptance criterion).
 *
 * Password-policy enforcement is split between the client-side Zod schema
 * (length) and Supabase (HIBP / leaked-password). A breached password is
 * surfaced as a clear, non-generic error so the User can pick a different
 * one — this isn't an enumeration concern because the User is already
 * authenticated via the recovery Session.
 */
export async function updatePassword(
  client: AuthClient,
  input: UpdatePasswordInput,
): Promise<UpdatePasswordResult> {
  const parsed = updatePasswordSchema.safeParse(input);
  if (!parsed.success) return invalidInputFirstIssue(parsed.error);

  // Cheap pre-check: if there's no Session, supabase-js will still POST
  // updateUser and get back an AuthSessionMissingError — but failing fast
  // with the same wording avoids the round-trip and keeps the integration
  // tests deterministic.
  const session = await client.auth.getSession();
  if (!session.data.session) {
    return {
      ok: false,
      error: AUTH_MESSAGES.recoverySessionMissing,
      code: 'invalid-credentials',
    };
  }

  const { error } = await client.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (isWeakPasswordError(error)) return weakPasswordResult(error);
    if (isSessionMissingError(error)) {
      return {
        ok: false,
        error: AUTH_MESSAGES.recoverySessionMissing,
        code: 'invalid-credentials',
      };
    }
    return { ok: false, error: AUTH_MESSAGES.unexpected, code: 'unexpected' };
  }

  // Revoke every OTHER Session for this User — issue #5 acceptance
  // criterion. The current device's Session is kept (scope: 'others').
  // A failure here is non-fatal: the password change already succeeded, so
  // we still report success to the User; the worst case is a stale Session
  // elsewhere that the next refresh will still tear down.
  await client.auth.signOut({ scope: 'others' });

  return { ok: true, data: { message: AUTH_MESSAGES.passwordUpdated } };
}
