import { expect, test } from '@playwright/test';

// The /auth/confirm Route Handler's failure branches — an expired, already-
// used, or malformed link must never dead-end. A bad verification link lands
// on /login with a resend affordance; a bad recovery link lands on
// /forgot-password. The token itself is never echoed. verifyEmailToken's
// mapping is unit-tested; here we pin the redirect contract the Route Handler
// wraps around it.

test.describe.configure({ mode: 'serial' });

test('a bad verification link redirects to /login?confirm=invalid', async ({ page }) => {
  await page.goto(`/auth/confirm?token_hash=pkce_${'0'.repeat(56)}&type=signup`);
  await expect(page).toHaveURL(/\/login\?.*confirm=invalid/);
  // We're on the login form, not an error page — the User can retry.
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test('a bad recovery link redirects to /forgot-password?reset=invalid', async ({ page }) => {
  await page.goto(`/auth/confirm?token_hash=pkce_${'0'.repeat(56)}&type=recovery`);
  await expect(page).toHaveURL(/\/forgot-password\?.*reset=invalid/);
  await expect(page.getByRole('button', { name: 'Send reset link' })).toBeVisible();
});

test('a missing token_hash redirects to /login?confirm=invalid', async ({ page }) => {
  await page.goto('/auth/confirm?type=signup');
  await expect(page).toHaveURL(/\/login\?.*confirm=invalid/);
});

test('an unknown type redirects to /login?confirm=invalid', async ({ page }) => {
  await page.goto('/auth/confirm?token_hash=whatever&type=bogus');
  await expect(page).toHaveURL(/\/login\?.*confirm=invalid/);
});
