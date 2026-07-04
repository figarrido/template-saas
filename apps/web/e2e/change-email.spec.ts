import { expect, test } from '@playwright/test';
import { waitForAuthLink } from './support/mailbox.js';
import { PASSWORD, signIn, signUpAndConfirm, uniqueEmail } from './support/auth.js';

// Change-email secure double-confirm (issue #7 / ADR-0003 + ADR-0005). With
// `double_confirm_changes = true`, requesting a change emails a confirm link
// to BOTH the current and the new address; the swap lands only once both are
// clicked, and until then the old address still signs in. The flow-level
// contracts (pending state, wrong-password rejection) live in
// packages/auth/test/integration/change-email; the two-recipient fan-out in
// the send-email hook is unit-tested in packages/email.

test.describe.configure({ mode: 'serial' });

test('change-email: re-auth guards, and a valid request emits a pending change', async ({
  page,
  request,
}) => {
  const oldEmail = uniqueEmail('changeemail-old');
  const newEmail = uniqueEmail('changeemail-new');

  await signUpAndConfirm(page, request, oldEmail);

  // --- guard: new email same as current → actionable inline error, no email.
  await page.goto('/account/change-email');
  await page.getByLabel('Current password').fill(PASSWORD);
  await page.getByLabel('New email').fill(oldEmail);
  await page.getByRole('button', { name: 'Change email' }).click();
  await expect(page.getByText(/same as your current email/i).first()).toBeVisible();

  // --- guard: wrong current password → generic re-auth error.
  await page.goto('/account/change-email');
  await page.getByLabel('Current password').fill('definitely-not-it');
  await page.getByLabel('New email').fill(newEmail);
  await page.getByRole('button', { name: 'Change email' }).click();
  await expect(page.getByText(/current password is incorrect/i).first()).toBeVisible();

  // --- valid request → "check both inboxes", and the change is queued.
  await page.goto('/account/change-email');
  await page.getByLabel('Current password').fill(PASSWORD);
  await page.getByLabel('New email').fill(newEmail);
  await page.getByRole('button', { name: 'Change email' }).click();
  await expect(page.getByText(/both inboxes/i).first()).toBeVisible();

  // Both addresses receive a confirmation (the double-confirm fan-out).
  await waitForAuthLink({ request, email: oldEmail, type: 'email_change' });
  await waitForAuthLink({ request, email: newEmail, type: 'email_change' });

  // The change is still PENDING — nothing confirmed yet, so the OLD address
  // must still sign in (issue #7 acceptance criterion).
  await page.context().clearCookies();
  await signIn(page, oldEmail, PASSWORD);
  await expect(page).not.toHaveURL(/\/login/);
});

test('change-email: confirming BOTH links swaps the address', async ({ page, request }) => {
  const oldEmail = uniqueEmail('changeemail2-old');
  const newEmail = uniqueEmail('changeemail2-new');

  await signUpAndConfirm(page, request, oldEmail);

  await page.goto('/account/change-email');
  await page.getByLabel('Current password').fill(PASSWORD);
  await page.getByLabel('New email').fill(newEmail);
  await page.getByRole('button', { name: 'Change email' }).click();
  await expect(page.getByText(/both inboxes/i).first()).toBeVisible();

  // Confirm from both the current and the new address — the swap applies only
  // once the second one lands. NEITHER click may show the invalid-link error:
  // the first is a partial confirmation (no session yet), the second completes
  // the change. This is the regression the PKCE/implicit-flow fix addresses.
  const oldLink = await waitForAuthLink({ request, email: oldEmail, type: 'email_change' });
  const newLink = await waitForAuthLink({ request, email: newEmail, type: 'email_change' });

  await page.goto(oldLink);
  await expect(page).not.toHaveURL(/confirm=invalid/);

  await page.goto(newLink);
  await expect(page).not.toHaveURL(/confirm=invalid/);

  // The swap took: the NEW address signs in, the OLD one no longer does.
  await page.context().clearCookies();
  await signIn(page, newEmail, PASSWORD);
  await expect(page).not.toHaveURL(/\/login/);

  await page.context().clearCookies();
  await signIn(page, oldEmail, PASSWORD);
  await expect(page).toHaveURL(/\/login/);
});
