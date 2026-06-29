'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  destinationForOrganizations,
  resendVerification,
  signIn,
  signInOAuth,
  signOut,
  type OAuthProvider,
  type ResendVerificationResult,
  type SignInOAuthResult,
  type SignInResult,
  type SignOutResult,
  type SignInInput,
  type ResendVerificationInput,
} from '@template/auth';
import { getRequestClient } from '@/lib/supabase/server';
import { getMyOrgRefs } from '@/lib/data/org';

// docs/architecture/09-api-boundary.md § Server Actions:
// Server Actions in apps/web are thin adapters. They build the cookie-bound
// Supabase client and delegate to the injectable flow functions in
// packages/auth so the same logic is exercised by the integration tests.

export async function loginAction(input: SignInInput): Promise<SignInResult> {
  const client = await getRequestClient();
  return signIn(client, input);
}

export async function logoutAction(): Promise<SignOutResult> {
  const client = await getRequestClient();
  return signOut(client);
}

export async function resendVerificationAction(
  input: ResendVerificationInput,
): Promise<ResendVerificationResult> {
  const client = await getRequestClient();
  return resendVerification(client, input);
}

/**
 * Resolves the post-sign-in destination and redirects. Called from the
 * login form after a successful `loginAction`, and from the /auth/callback
 * Route Handler after an OAuth exchange. Routes by Organization count:
 * 0 → onboarding stub, 1 → that org's dashboard, 2+ → picker.
 * docs/architecture/03-auth.md § First-login routing.
 */
export async function routeAfterLoginAction(): Promise<void> {
  const destination = destinationForOrganizations(await getMyOrgRefs());
  redirect(destination.path);
}

/**
 * Initiate the OAuth hand-off for `provider` and redirect the browser to the
 * provider's authorization URL. On return, the provider hits /auth/callback
 * with a PKCE `code`. Issue #8.
 */
export async function oauthSignInAction(provider: OAuthProvider): Promise<SignInOAuthResult> {
  const client = await getRequestClient();
  const origin = await requestOrigin();
  const result = await signInOAuth(client, {
    provider,
    redirectTo: `${origin}/auth/callback`,
  });
  if (result.ok) redirect(result.data.url);
  return result;
}

async function requestOrigin(): Promise<string> {
  const h = await headers();
  const forwardedHost = h.get('x-forwarded-host');
  const host = forwardedHost ?? h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';
  if (!host) throw new Error('Missing host header — cannot build OAuth redirect URL.');
  return `${proto}://${host}`;
}
