import { expect, test } from '@playwright/test';
import { PASSWORD, signUpAndConfirm, signIn, uniqueEmail } from './support/auth.js';

// E2E for issue #19 / org creation slice 2: an existing Member creates
// additional organizations from the org picker and the dashboard org switcher.

test.describe.configure({ mode: 'serial' });

test('existing member creates additional org from picker', async ({ page, request }) => {
  const t1 = crypto.randomUUID().slice(0, 8);
  const t2 = crypto.randomUUID().slice(0, 8);
  const t3 = crypto.randomUUID().slice(0, 8);
  const email = uniqueEmail('new-org');

  // Sign up and confirm, then sign in to trigger routing.
  await signUpAndConfirm(page, request, email);
  await signIn(page, email, PASSWORD);
  await expect(page).toHaveURL(/\/onboarding\/first-org/);

  // Create org Alpha (first org — via the onboarding flow).
  await page.getByLabel('Organization name').fill(`Alpha ${t1}`);
  await page.getByRole('button', { name: 'Create organization' }).click();
  await expect(page).toHaveURL(new RegExp(`/alpha-${t1}/dashboard`));

  // From the dashboard switcher, navigate to /orgs/new and create org Beta.
  await page.getByRole('link', { name: 'New organization' }).click();
  await expect(page).toHaveURL(/\/orgs\/new/);
  await page.getByLabel('Organization name').fill(`Beta ${t2}`);
  await page.getByRole('button', { name: 'Create organization' }).click();
  await expect(page).toHaveURL(new RegExp(`/beta-${t2}/dashboard`));

  // Sign in again — now with 2 orgs, the User routes to the picker.
  await signIn(page, email, PASSWORD);
  await expect(page).toHaveURL(/\/orgs$/);

  // AC3/AC4: both prior orgs are listed in the picker.
  await expect(page.getByRole('link', { name: `Alpha ${t1}` })).toBeVisible();
  await expect(page.getByRole('link', { name: `Beta ${t2}` })).toBeVisible();

  // Click the picker's "New organization" link → /orgs/new, create org Gamma.
  await page.getByRole('link', { name: 'New organization' }).click();
  await expect(page).toHaveURL(/\/orgs\/new/);
  await page.getByLabel('Organization name').fill(`Gamma ${t3}`);
  await page.getByRole('button', { name: 'Create organization' }).click();
  // AC2: redirected to the new org's dashboard (active org = Gamma).
  await expect(page).toHaveURL(new RegExp(`/gamma-${t3}/dashboard`));
  await expect(page.getByRole('heading', { name: `gamma-${t3}` })).toBeVisible();

  // AC3/AC4: all three orgs appear in the dashboard switcher.
  const switcher = page.getByRole('navigation', { name: 'Organizations' });
  await expect(switcher.getByRole('link', { name: `Alpha ${t1}` })).toBeVisible();
  await expect(switcher.getByRole('link', { name: `Beta ${t2}` })).toBeVisible();
  await expect(switcher.getByRole('link', { name: `Gamma ${t3}` })).toBeVisible();
});
