import { signInSchema, type SignInInput } from '../schemas.js';
import { AUTH_MESSAGES } from './messages.js';
import type { ActionResult, AuthClient } from './types.js';

export type SignInResult = ActionResult<{ userId: string }>;

/**
 * Sign a User in with email + password.
 *
 * Injectable: takes a Supabase client (cookie-bound in `apps/web`, anon in
 * the integration tests) and returns a typed `ActionResult`. Implements the
 * ADR-0002 enumeration mapping:
 *
 * - Wrong password OR unknown email                → generic "invalid email or password".
 * - Correct password but account not yet confirmed → "email not confirmed"
 *   (the only place the existence of the account is acknowledged).
 * - Everything else                                → generic "invalid email or password".
 *
 * Supabase's `email_not_confirmed` error is only raised when the password
 * matches; that's how we can branch on it safely without leaking. See
 * docs/architecture/03-auth.md § Onboarding & invitation flows.
 */
export async function signIn(client: AuthClient, input: SignInInput): Promise<SignInResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: AUTH_MESSAGES.invalidInput, code: 'invalid-input' };
  }

  const { data, error } = await client.auth.signInWithPassword(parsed.data);

  if (error) {
    if (isNotConfirmedError(error)) {
      return { ok: false, error: AUTH_MESSAGES.notConfirmed, code: 'not-confirmed' };
    }
    return { ok: false, error: AUTH_MESSAGES.invalidCredentials, code: 'invalid-credentials' };
  }

  if (!data.user) {
    return { ok: false, error: AUTH_MESSAGES.invalidCredentials, code: 'invalid-credentials' };
  }

  return { ok: true, data: { userId: data.user.id } };
}

function isNotConfirmedError(error: { code?: string | undefined; message?: string }): boolean {
  if (error.code === 'email_not_confirmed') return true;
  // Older supabase-js versions only expose the string. Match defensively;
  // the integration test pins the contract.
  return typeof error.message === 'string' && /not confirmed/i.test(error.message);
}
