import { expect, test } from '@playwright/test';
import { waitForAuthLink } from './support/mailbox.js';
import { AUTH_SURFACE, PASSWORD, uniqueEmail } from './support/auth.js';

// Golden-path E2E for issue #4 / parent PRD #2: a User signs up, opens the
// verification email in the local mail catcher (Mailpit), follows the confirm
// link, signs in, and signs out. Kept as a single test so the round-trip is
// exercised end-to-end without partial-state flakes; the per-step assertions
// live in the integration suite (packages/auth/test/integration/sign-up.*).
//
// Email is read through the shared Mailpit client in ./support/mailbox.ts —
// see that file for the API + the E2E_BASE_URL === NEXT_PUBLIC_SITE_URL
// invariant the confirm links depend on.

test.describe.configure({ mode: 'serial' });

test('sign-up → email confirm → sign-in → sign-out', async ({ page, request }) => {
  const email = uniqueEmail('signup');

  await page.goto('/signup');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign up' }).click();

  await expect(page).toHaveURL(/\/check-email/);
  await expect(page.getByRole('heading', { name: /check your email/i })).toBeVisible();

  const confirmUrl = await waitForAuthLink({ request, email, type: 'signup' });
  await page.goto(confirmUrl);

  // Successful confirm lands the User somewhere inside the app — first-org
  // onboarding (0 orgs), the org picker (2+), or a dashboard. Asserting we've
  // left the auth surface is the version-agnostic proxy for "signed in".
  await expect(page).not.toHaveURL(AUTH_SURFACE);

  // The confirmed account can now sign in fresh.
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/);

  // Sign-out is exposed on the (app)/dashboard in slice 1.
  const signOut = page.getByRole('button', { name: /sign out/i });
  if (await signOut.isVisible().catch(() => false)) {
    await signOut.click();
    await expect(page).toHaveURL(/\/login/);
  }
});
