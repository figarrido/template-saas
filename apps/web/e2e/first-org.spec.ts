import { expect, test } from '@playwright/test';
import { PASSWORD, signUpAndConfirm, signIn, uniqueEmail } from './support/auth.js';

// E2E for issue #18 / org creation slice 1: a 0-membership User signs up,
// is routed to /onboarding/first-org, fills in the org name, and lands on
// the org's dashboard with the slug in the URL and heading.

test.describe.configure({ mode: 'serial' });

test('first-org creation: 0-membership user creates org and lands on dashboard', async ({
  page,
  request,
}) => {
  const token = crypto.randomUUID().slice(0, 8);
  const email = uniqueEmail('first-org');
  const orgName = `Acme QA ${token}`;
  const slug = `acme-qa-${token}`;

  // Sign up and confirm — user is now signed in with 0 memberships.
  await signUpAndConfirm(page, request, email);

  // Sign in again so routeAfterLoginAction fires and routes us to /onboarding/first-org.
  await signIn(page, email, PASSWORD);
  await expect(page).toHaveURL(/\/onboarding\/first-org/);

  // Fill in the form and submit.
  await page.getByLabel('Organization name').fill(orgName);
  await page.getByRole('button', { name: 'Create organization' }).click();

  // Server action redirects to /{slug}/dashboard.
  await expect(page).toHaveURL(new RegExp(`/${slug}/dashboard`));

  // Dashboard h1 renders the slug.
  await expect(page.getByRole('heading', { name: slug })).toBeVisible();
});
