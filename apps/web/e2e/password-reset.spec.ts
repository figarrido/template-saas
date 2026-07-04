import { expect, test } from '@playwright/test';
import { waitForAuthLink } from './support/mailbox.js';
import { PASSWORD, signUpAndConfirm, uniqueEmail } from './support/auth.js';

// Golden-path E2E for issue #5 / parent PRD #2: a User signs up & confirms
// their email, then runs the recovery round-trip — request a reset link →
// open the recovery email in Mailpit → land on /reset-password → set a new
// password → land signed in inside the app → sign in fresh with the new
// password, and confirm the old one no longer works. The per-step contracts
// (generic-response, other-Session revocation) are pinned in
// packages/auth/test/integration/password-reset.

test.describe.configure({ mode: 'serial' });

test('forgot-password → recovery email → reset → sign-in with new password', async ({
  page,
  request,
}) => {
  const email = uniqueEmail('reset');
  const newPassword = 'fresh-kale-bicycle-merlot-9000';

  // --- bootstrap: a real, confirmed account to recover.
  await signUpAndConfirm(page, request, email);

  // --- request a reset. The response is always the generic "if an account
  // exists" copy (ADR-0002) whether or not the address is registered.
  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  // The generic copy renders both as an inline <p> and a toast; match either.
  // (Avoid getByRole('status') — the Next.js dev overlay injects its own.)
  await expect(page.getByText(/if an account exists/i).first()).toBeVisible();

  // --- open the recovery email and land on /reset-password (signed in via
  // the recovery Session the confirm route established).
  const recoveryUrl = await waitForAuthLink({ request, email, type: 'recovery' });
  await page.goto(recoveryUrl);
  await expect(page).toHaveURL(/\/reset-password/);

  await page.getByLabel('New password').fill(newPassword);
  await page.getByRole('button', { name: 'Update password' }).click();

  // After updatePassword the User is routed into the app — not bounced back
  // to a /login or /forgot-password screen.
  await expect(page).not.toHaveURL(/\/(login|forgot-password|reset-password)/);

  // --- old password should no longer work, new password should.
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel('Password').fill(newPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/);
});
