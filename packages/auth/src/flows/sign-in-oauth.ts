import { PROVIDERS, type OAuthProvider } from '../providers.js';
import { AUTH_MESSAGES } from './messages.js';
import type { ActionResult, AuthClient } from './types.js';

export type SignInOAuthInput = {
  provider: OAuthProvider;
  /** Absolute URL the provider should redirect back to (the /auth/callback route). */
  redirectTo: string;
};

export type SignInOAuthResult = ActionResult<{ url: string }>;

/**
 * Initiate OAuth sign-in.
 *
 * Issue #8 — the wired-but-dormant OAuth seam. Returns the provider's
 * authorization URL so the caller (a Server Action) can `redirect()` to it.
 * Identity auto-linking on a verified-email match is the Supabase default —
 * we trust each enabled provider's `email_verified` per ADR 0004, no manual
 * link/unlink UI ships.
 */
export async function signInOAuth(
  client: AuthClient,
  input: SignInOAuthInput,
): Promise<SignInOAuthResult> {
  if (!isKnownProvider(input.provider)) {
    return { ok: false, error: AUTH_MESSAGES.invalidInput, code: 'invalid-input' };
  }

  const { data, error } = await client.auth.signInWithOAuth({
    provider: input.provider,
    options: { redirectTo: input.redirectTo },
  });

  if (error || !data?.url) {
    return { ok: false, error: AUTH_MESSAGES.unexpected, code: 'unexpected' };
  }

  return { ok: true, data: { url: data.url } };
}

function isKnownProvider(value: string): value is OAuthProvider {
  return PROVIDERS.some((p) => p.provider === value);
}
