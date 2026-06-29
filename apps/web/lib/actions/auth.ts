'use server';

import { redirect } from 'next/navigation';
import {
  destinationForOrganizations,
  requestPasswordReset,
  resendVerification,
  signIn,
  signOut,
  signUp,
  updatePassword,
  type RequestPasswordResetInput,
  type RequestPasswordResetResult,
  type ResendVerificationInput,
  type ResendVerificationResult,
  type SignInInput,
  type SignInResult,
  type SignOutResult,
  type SignUpInput,
  type SignUpResult,
  type UpdatePasswordInput,
  type UpdatePasswordResult,
} from '@template/auth';
import { env } from '@template/env/web';
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

export async function signUpAction(input: SignUpInput): Promise<SignUpResult> {
  const client = await getRequestClient();
  return signUp(client, input, {
    // Verification links use the `{{ .TokenHash }}` template style and land
    // on our `/auth/confirm` Route Handler — see parent PRD § Execution
    // model. Supabase appends `?token_hash=…&type=signup` to this URL.
    emailRedirectTo: `${env.NEXT_PUBLIC_SITE_URL}/auth/confirm`,
  });
}

export async function resendVerificationAction(
  input: ResendVerificationInput,
): Promise<ResendVerificationResult> {
  const client = await getRequestClient();
  return resendVerification(client, input);
}

export async function requestPasswordResetAction(
  input: RequestPasswordResetInput,
): Promise<RequestPasswordResetResult> {
  const client = await getRequestClient();
  return requestPasswordReset(client, input, {
    // Recovery links use the `{{ .TokenHash }}` template style — Supabase
    // appends `?token_hash=…&type=recovery` to this URL. /auth/confirm
    // verifies the token, writes the Session cookies, and 303s the User
    // to /reset-password.
    redirectTo: `${env.NEXT_PUBLIC_SITE_URL}/auth/confirm`,
  });
}

export async function updatePasswordAction(
  input: UpdatePasswordInput,
): Promise<UpdatePasswordResult> {
  const client = await getRequestClient();
  return updatePassword(client, input);
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
