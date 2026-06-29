import { changeEmailSchema, type ChangeEmailInput } from '../schemas.js';
import { hasEmailIdentity } from './identity.js';
import { AUTH_MESSAGES } from './messages.js';
import type { ActionResult, AuthClient } from './types.js';

export type ChangeEmailResult = ActionResult<{ message: string }>;

export type ChangeEmailOptions = {
  /**
   * Forwarded to `updateUser` as the `emailRedirectTo` option. Supabase
   * appends `?token_hash=…&type=email_change` and emails the link to both
   * the old and the new address (with `double_confirm_changes = true`).
   * Pass the `/auth/confirm` URL for this surface so the link lands on the
   * Route Handler that calls `verifyOtp`.
   */
  emailRedirectTo?: string;
};

/**
 * Request an email change for a signed-in User.
 *
 * ADR-0003 (Re-authentication for sensitive account changes): the current
 * password is verified by a silent `signInWithPassword` against the
 * authenticated User's email before `updateUser` is called. A mismatch
 * returns the same generic error shape as `changePassword` so the two
 * surfaces are indistinguishable.
 *
 * Secure double-confirm (issue #7): Supabase is configured with
 * `auth.email.double_confirm_changes = true`, which means `updateUser({
 * email })` emits a confirmation link to BOTH the old and the new address.
 * The change applies only after both links are clicked. Until then the
 * User can still sign in with their old email — the row's `email` is not
 * touched; the pending value lives in `auth.users.email_change`. Both
 * messages render through the send-email hook in `packages/email`
 * (React Email + Resend in prod / InBucket in dev — ADR-0005).
 *
 * A User whose only Identity is OAuth (no `provider: 'email'`) cannot
 * satisfy the re-auth gate; the flow short-circuits with
 * `no-password-identity` so the UI can route them to the recovery flow
 * (story 41).
 *
 * Errors from Supabase's `updateUser` — including `email_exists` when
 * another User already owns the new address — are mapped to the generic
 * `unexpected` branch rather than echoed. Echoing would let a signed-in
 * attacker enumerate other Users' addresses; the same enumeration posture
 * ADR-0002 establishes for unauthenticated surfaces applies here.
 */
export async function changeEmail(
  client: AuthClient,
  input: ChangeEmailInput,
  options: ChangeEmailOptions = {},
): Promise<ChangeEmailResult> {
  const parsed = changeEmailSchema.safeParse(input);
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

  // The schema lowercases / trims the new email, so a same-address check
  // is just a direct comparison against the (already lowercased) current
  // email Supabase stores.
  if (parsed.data.newEmail === userData.user.email.toLowerCase()) {
    return { ok: false, error: AUTH_MESSAGES.emailUnchanged, code: 'invalid-input' };
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

  const { error: updateError } = options.emailRedirectTo
    ? await client.auth.updateUser(
        { email: parsed.data.newEmail },
        { emailRedirectTo: options.emailRedirectTo },
      )
    : await client.auth.updateUser({ email: parsed.data.newEmail });

  if (updateError) {
    return { ok: false, error: AUTH_MESSAGES.unexpected, code: 'unexpected' };
  }

  return { ok: true, data: { message: AUTH_MESSAGES.emailChangeRequested } };
}
