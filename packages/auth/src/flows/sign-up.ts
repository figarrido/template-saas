import { signUpSchema, type SignUpInput } from '../schemas.js';
import { isWeakPasswordError } from './errors.js';
import { AUTH_MESSAGES } from './messages.js';
import type { ActionResult, AuthClient } from './types.js';

export type SignUpResult = ActionResult<{ message: string }>;

export type SignUpOptions = {
  /** Forwarded to supabase-js so the verification link's `redirect_to`
   *  parameter points at the calling app's `/auth/confirm` route. */
  emailRedirectTo?: string;
};

/**
 * Self-serve sign-up for end Users.
 *
 * Returns the same generic "check your email" response whether the address
 * is new or already registered (ADR-0002: no account-existence leak). The
 * verification gate (`enable_confirmations = true`) means a successful
 * sign-up returns no Session — the User lands on a "check your email"
 * interstitial and confirms via the link before first sign-in.
 *
 * Supabase signals "already registered" by returning a user with an empty
 * `identities` array and `session: null` — the flow collapses this onto
 * the success branch deliberately. Real-owner notification (story 9) is
 * Supabase's responsibility; we don't override it.
 *
 * Weak-password (HIBP) and other Supabase-side validation are surfaced as
 * a clear, non-generic error so the User can pick a different password.
 * Unlike sign-in, the existence of the email isn't revealed by the weak-
 * password branch — the same generic shape would apply.
 */
export async function signUp(
  client: AuthClient,
  input: SignUpInput,
  options: SignUpOptions = {},
): Promise<SignUpResult> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? AUTH_MESSAGES.invalidInput,
      code: 'invalid-input',
    };
  }

  const { error } = await client.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: options.emailRedirectTo ? { emailRedirectTo: options.emailRedirectTo } : undefined,
  });

  if (error) {
    if (isWeakPasswordError(error)) {
      return {
        ok: false,
        error: error.message || AUTH_MESSAGES.weakPassword,
        code: 'invalid-input',
      };
    }
    return { ok: false, error: AUTH_MESSAGES.unexpected, code: 'unexpected' };
  }

  // Whether the email is new or already registered, the shape is the same.
  // Any `data.session` is dropped on the floor — sign-up never produces an
  // active Session because verification is required first.
  return { ok: true, data: { message: AUTH_MESSAGES.checkYourEmail } };
}
