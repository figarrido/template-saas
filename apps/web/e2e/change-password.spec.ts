import { expect, test } from '@playwright/test';
import { PASSWORD, signIn, signUpAndConfirm, uniqueEmail } from './support/auth.js';

// Change-password round-trip (issue #6 / ADR-0003). A confirmed, signed-in
// User visits the account page: a wrong current password is rejected with the
// generic re-auth error; the correct one succeeds; the new password then works
// on a fresh sign-in and the old one no longer does. The OAuth-only
// no-password-identity branch is a unit test (packages/auth flows.test.ts) —
// it can't be reached from the seeded email/password account here.

test.describe.configure({ mode: 'serial' });

test('change-password: wrong current rejected, correct one rotates the password', async ({
  page,
  request,
}) => {
  const email = uniqueEmail('changepw');
  const newPassword = 'kale-bicycle-merlot-rebound-42';

  await signUpAndConfirm(page, request, email);

  // --- wrong current password → generic re-auth error, no change.
  await page.goto('/account/change-password');
  await page.getByLabel('Current password').fill('definitely-not-it');
  await page.getByLabel('New password').fill(newPassword);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText(/current password is incorrect/i).first()).toBeVisible();

  // --- correct current password → success.
  await page.goto('/account/change-password');
  await page.getByLabel('Current password').fill(PASSWORD);
  await page.getByLabel('New password').fill(newPassword);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText(/password updated/i).first()).toBeVisible();

  // --- drop the Session and prove the rotation took: old fails, new works.
  await page.context().clearCookies();

  await signIn(page, email, PASSWORD);
  await expect(page).toHaveURL(/\/login/);

  await signIn(page, email, newPassword);
  await expect(page).not.toHaveURL(/\/login/);
});
