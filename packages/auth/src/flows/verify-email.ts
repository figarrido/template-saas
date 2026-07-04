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
 *
 * `email_change` is the one type that can succeed WITHOUT returning a user:
 * with `double_confirm_changes = true` the change is verified in two clicks
 * (current + new address), and the first confirmation succeeds but yields no
 * user/session because the swap only applies once BOTH links are used. That
 * partial confirmation is a valid link, not a broken one, so it must not be
 * mapped to the "no longer valid" error. Every other type must return a user.
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

  if (error || (!data?.user && input.type !== 'email_change')) {
    return { ok: false, error: AUTH_MESSAGES.confirmLinkInvalid, code: 'invalid-credentials' };
  }

  return { ok: true, data: { userId: data?.user?.id ?? '' } };
}
