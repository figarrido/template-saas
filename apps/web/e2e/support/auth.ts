import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { waitForAuthLink } from './mailbox.js';

// Flow helpers shared across the auth E2E specs. Each spec drives real UI —
// these collapse the repeated "sign up, open the email, click confirm" and
// "sign in" round-trips so the specs read as the scenario they're pinning.

/** Meets the shared password policy (>= 10 chars, not a known-breached one). */
export const PASSWORD = 'correct-horse-battery-staple';

/** A fresh, per-run-unique address so re-runs never collide on an existing
 *  auth.users row or read a stale Mailpit message. */
export function uniqueEmail(prefix: string): string {
  return `e2e-${prefix}-${crypto.randomUUID()}@template.test`;
}

/** The auth surfaces a signed-in User should never be sitting on. Used as a
 *  proxy assertion for "we landed inside the app". */
export const AUTH_SURFACE = /\/(login|signup|check-email|forgot-password|reset-password|auth\/confirm)/;

/**
 * Sign up, open the verification email in Mailpit, follow the confirm link,
 * and assert the User lands inside the app (signed in). Returns nothing — the
 * caller continues from the confirmed, signed-in state.
 */
export async function signUpAndConfirm(
  page: Page,
  request: APIRequestContext,
  email: string,
  password = PASSWORD,
): Promise<void> {
  await page.goto('/signup');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign up' }).click();
  await expect(page).toHaveURL(/\/check-email/);

  const confirmUrl = await waitForAuthLink({ request, email, type: 'signup' });
  await page.goto(confirmUrl);
  await expect(page).not.toHaveURL(AUTH_SURFACE);
}

/** Sign in via the login form. Does not assert the outcome — the caller pins
 *  success (left the /login surface) or failure (stayed) as the case needs. */
export async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}
