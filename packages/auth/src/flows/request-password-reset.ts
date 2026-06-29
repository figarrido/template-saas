import {
  requestPasswordResetSchema,
  type RequestPasswordResetInput,
} from '../schemas.js';
import { AUTH_MESSAGES } from './messages.js';
import type { ActionResult, AuthClient } from './types.js';

export type RequestPasswordResetResult = ActionResult<{ message: string }>;

export type RequestPasswordResetOptions = {
  /** Forwarded to supabase-js as `redirectTo` so the recovery link in the
   *  email points at the calling app's `/auth/confirm` route — which then
   *  hands the User off to `/reset-password`. */
  redirectTo?: string;
};

/**
 * Request a password-reset email.
 *
 * Always returns the same generic "if an account exists..." response
 * whether the address is registered or not (ADR-0002: no account-existence
 * leak). Validation failures and Supabase rate-limit errors collapse onto
 * the same success shape so a caller — and a curious enumerator — cannot
 * distinguish them.
 *
 * The recovery email itself is rendered by the send-email Auth hook in
 * `packages/email` and pointed at `/auth/confirm?type=recovery&…`. The
 * /auth/confirm Route Handler verifies the one-time `token_hash`, sets the
 * Session cookies, and 303s the User to `/reset-password` where they pick a
 * new password (the `updatePassword` flow).
 */
export async function requestPasswordReset(
  client: AuthClient,
  input: RequestPasswordResetInput,
  options: RequestPasswordResetOptions = {},
): Promise<RequestPasswordResetResult> {
  const parsed = requestPasswordResetSchema.safeParse(input);
  if (!parsed.success) {
    // No-op silently. Surfacing a "bad email" error would tell an
    // enumerator that the address shape didn't even parse — leaking
    // less than account existence, but still more than the generic
    // posture allows.
    return { ok: true, data: { message: AUTH_MESSAGES.recoveryRequested } };
  }

  await client.auth.resetPasswordForEmail(
    parsed.data.email,
    options.redirectTo ? { redirectTo: options.redirectTo } : undefined,
  );

  return { ok: true, data: { message: AUTH_MESSAGES.recoveryRequested } };
}
