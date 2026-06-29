import { resendVerificationSchema, type ResendVerificationInput } from '../schemas.js';
import { AUTH_MESSAGES } from './messages.js';
import type { ActionResult, AuthClient } from './types.js';

export type ResendVerificationResult = ActionResult<{ message: string }>;

/**
 * Resend the verification email for an unconfirmed account.
 *
 * Always returns the same generic "if that account exists..." message — the
 * affordance is meant to unblock the User who hit the not-confirmed branch
 * of sign-in, not to be a back-door enumeration oracle. The underlying
 * Supabase call no-ops silently for unknown / already-confirmed addresses.
 */
export async function resendVerification(
  client: AuthClient,
  input: ResendVerificationInput,
): Promise<ResendVerificationResult> {
  const parsed = resendVerificationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: true, data: { message: AUTH_MESSAGES.resendSent } };
  }

  await client.auth.resend({ type: 'signup', email: parsed.data.email });
  return { ok: true, data: { message: AUTH_MESSAGES.resendSent } };
}
