'use server';

import { redirect } from 'next/navigation';
import {
  destinationForOrganizations,
  resendVerification,
  signIn,
  signOut,
  type ResendVerificationResult,
  type SignInResult,
  type SignOutResult,
  type SignInInput,
  type ResendVerificationInput,
} from '@template/auth';
import { getRequestClient } from '@/lib/supabase/server';
import { getMyOrganizations } from '@/lib/data/org';

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
 * login form after a successful `loginAction`. Routes by Organization
 * count: 0 → onboarding stub, 1 → that org's dashboard, 2+ → picker.
 * docs/architecture/03-auth.md § First-login routing.
 */
export async function routeAfterLoginAction(): Promise<void> {
  const memberships = await getMyOrganizations();
  const orgs = memberships
    .map((m) => (m.organizations ? { slug: m.organizations.slug } : null))
    .filter((x): x is { slug: string } => x !== null);

  const destination = destinationForOrganizations(orgs);
  redirect(destination.path);
}
