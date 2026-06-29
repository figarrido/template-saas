import { AUTH_MESSAGES } from './messages.js';
import type { ActionResult, AuthClient } from './types.js';

export type VerifyEmailResult = ActionResult<{ userId: string }>;

// The Supabase OTP types used for one-time email verification links. The
// template's `{{ .TokenHash }}` email templates point at `/auth/confirm`,
// which dispatches by query-string `type` into this flow.
export const EMAIL_OTP_TYPES = ['signup', 'magiclink', 'recovery', 'invite', 'email_change'] as const;
export type EmailOtpType = (typeof EMAIL_OTP_TYPES)[number];

export function isEmailOtpType(value: unknown): value is EmailOtpType {
  return typeof value === 'string' && (EMAIL_OTP_TYPES as readonly string[]).includes(value);
}

/**
 * Verify a one-time `token_hash` from a Supabase auth email.
 *
 * Called by the `/auth/confirm` Route Handler. On success the Supabase
 * client writes its Session cookies, so a successful verify-then-redirect
 * lands the User signed in. On failure (expired / already-used / malformed
 * link) we surface a single non-leaky "no longer valid" message — the UI
 * pairs it with a resend affordance.
 */
export async function verifyEmailToken(
  client: AuthClient,
  input: { tokenHash: string; type: EmailOtpType },
): Promise<VerifyEmailResult> {
  if (!input.tokenHash) {
    return { ok: false, error: AUTH_MESSAGES.confirmLinkInvalid, code: 'invalid-input' };
  }

  const { data, error } = await client.auth.verifyOtp({
    type: input.type,
    token_hash: input.tokenHash,
  });

  if (error || !data?.user) {
    return { ok: false, error: AUTH_MESSAGES.confirmLinkInvalid, code: 'invalid-credentials' };
  }

  return { ok: true, data: { userId: data.user.id } };
}
