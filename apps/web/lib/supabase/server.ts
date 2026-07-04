import { getUserClient, type UserClient } from '@template/db';
import { env } from '@template/env/web';
import { cookieAdapter } from './cookie-adapter.js';

// Builds the cookie-bound, RLS-honoring Supabase client used by Server
// Actions, Route Handlers, and RSC data helpers. Centralizing the env +
// cookie wiring keeps the auth Server Actions a one-liner over the flow.

export async function getRequestClient(): Promise<UserClient> {
  return getUserClient({
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    supabasePublishableKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    cookies: await cookieAdapter(),
  });
}

/**
 * Client for the `/auth/confirm` Route Handler. Identical to
 * `getRequestClient` but on the **implicit** auth flow: verifying an email
 * one-time link (`verifyOtp` with `token_hash`) must not depend on the PKCE
 * `code_verifier` from the browser that started the flow. That verifier is
 * single-use, so a double-confirm email change (two links) or a link opened on
 * a different device would otherwise fail with `otp_expired`. OAuth keeps PKCE
 * via `/auth/callback` + `getRequestClient`.
 */
export async function getConfirmClient(): Promise<UserClient> {
  return getUserClient({
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    supabasePublishableKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    cookies: await cookieAdapter(),
    flowType: 'implicit',
  });
}
