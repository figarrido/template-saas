import { AUTH_MESSAGES } from './messages.js';
import type { ActionResult, AuthClient } from './types.js';

export type ExchangeOAuthCodeResult = ActionResult<{ userId: string }>;

/**
 * Exchange an OAuth PKCE `code` for a Session.
 *
 * Issue #8 — called by the /auth/callback Route Handler after the provider
 * redirects the browser back with `?code=...`. A successful exchange persists
 * the Session via the cookie-bound Supabase client (the same client used by
 * Server Actions) so the User is signed in for the subsequent first-login
 * routing step.
 *
 * Mirrors the ADR-0002 posture: any failure surfaces a generic
 * "invalid-credentials" — we never explain *why* the exchange failed.
 */
export async function exchangeOAuthCode(
  client: AuthClient,
  code: string,
): Promise<ExchangeOAuthCodeResult> {
  if (typeof code !== 'string' || code.length === 0) {
    return { ok: false, error: AUTH_MESSAGES.invalidInput, code: 'invalid-input' };
  }

  const { data, error } = await client.auth.exchangeCodeForSession(code);

  if (error || !data?.user) {
    return {
      ok: false,
      error: AUTH_MESSAGES.invalidCredentials,
      code: 'invalid-credentials',
    };
  }

  return { ok: true, data: { userId: data.user.id } };
}
