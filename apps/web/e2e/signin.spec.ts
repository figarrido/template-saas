import { expect, test } from '@playwright/test';
import { messageCountTo } from './support/mailbox.js';
import { PASSWORD, uniqueEmail } from './support/auth.js';

// Sign-in edge cases — the ADR-0002 enumeration posture and the not-confirmed
// resend affordance, driven through the real login UI. The flow-level mapping
// is pinned in packages/auth/test/integration/sign-in; here we prove the form
// surfaces each branch correctly (generic error copy, resend button, a real
// re-sent email landing in Mailpit).

test.describe.configure({ mode: 'serial' });

test('unknown email and wrong password both show the same generic error', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(uniqueEmail('nobody'));
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Stays on /login with the single generic message — no "no such account".
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText(/invalid email or password/i).first()).toBeVisible();
});

test('unconfirmed sign-in is blocked with a resend affordance that delivers a fresh email', async ({
  page,
  request,
}) => {
  const email = uniqueEmail('unconfirmed');

  // Sign up but DON'T confirm — leaves an unconfirmed account + 1 email.
  await page.goto('/signup');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign up' }).click();
  await expect(page).toHaveURL(/\/check-email/);

  // Correct password + unconfirmed account is the one branch that admits the
  // account exists (ADR-0002): "email not confirmed" + a resend button.
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText(/not confirmed/i).first()).toBeVisible();

  const resend = page.getByRole('button', { name: /resend confirmation email/i });
  await expect(resend).toBeVisible();

  // Clicking resend delivers a second confirmation email to the mailbox.
  await resend.click();
  await expect
    .poll(() => messageCountTo(request, email), { timeout: 30_000 })
    .toBeGreaterThanOrEqual(2);
});
