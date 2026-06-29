import { expect, test } from '@playwright/test';

// Golden-path E2E for issue #5 / parent PRD #2: a User signs up & confirms
// their email, then runs the recovery round-trip — request a reset link →
// open the recovery email in InBucket → land on /reset-password → set a new
// password → land signed in inside the app → sign in fresh with the new
// password. The per-step contracts (generic-response, other-Session
// revocation) are pinned in packages/auth/test/integration/password-reset.

const INBUCKET_URL = process.env.INBUCKET_URL ?? 'http://127.0.0.1:54424';

test.describe.configure({ mode: 'serial' });

test('forgot-password → InBucket recovery → reset → sign-in with new password', async ({
  page,
  request,
}) => {
  const email = `e2e-reset-${crypto.randomUUID()}@template.test`;
  const password = 'correct-horse-battery-staple';
  const newPassword = 'fresh-kale-bicycle-merlot-9000';

  // --- bootstrap: sign up + confirm so we have a real account to reset.
  await page.goto('/signup');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign up' }).click();
  await expect(page).toHaveURL(/\/check-email/);

  const verifyUrl = await pollForAuthLink(request, email, 'signup');
  await page.goto(verifyUrl);
  await expect(page).not.toHaveURL(/\/(login|signup|check-email|auth\/confirm)/);

  // --- request a reset.
  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toContainText(/if an account exists/i);

  // --- open the recovery email and land on /reset-password (signed in).
  const recoveryUrl = await pollForAuthLink(request, email, 'recovery');
  await page.goto(recoveryUrl);
  await expect(page).toHaveURL(/\/reset-password/);

  await page.getByLabel('New password').fill(newPassword);
  await page.getByRole('button', { name: 'Update password' }).click();

  // After updatePassword the User is routed into the app — the alert
  // shouldn't bounce us back to a /login or /forgot-password screen.
  await expect(page).not.toHaveURL(/\/(login|forgot-password|reset-password)/);

  // --- old password should no longer work, new password should.
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel('Password').fill(newPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/);
});

// Pulls the most recent /auth/confirm link with the given type out of the
// User's InBucket mailbox. Polls because Supabase fires the send_email
// hook asynchronously and InBucket indexing can lag a beat.
async function pollForAuthLink(
  request: import('@playwright/test').APIRequestContext,
  email: string,
  type: 'signup' | 'recovery',
): Promise<string> {
  const mailbox = email.split('@')[0]!;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const list = await request.get(`${INBUCKET_URL}/api/v1/mailbox/${mailbox}`);
    if (list.ok()) {
      const messages = (await list.json()) as Array<{ id: string }>;
      // Walk newest-first so we don't return an old verify link when the
      // recovery hasn't arrived yet.
      for (let i = messages.length - 1; i >= 0; i--) {
        const id = messages[i]?.id;
        if (!id) continue;
        const detail = await request.get(`${INBUCKET_URL}/api/v1/mailbox/${mailbox}/${id}`);
        const body = (await detail.json()) as { body?: { html?: string; text?: string } };
        const html = body.body?.html ?? body.body?.text ?? '';
        const re = new RegExp(`https?://[^"'\\s<>]+/auth/confirm[^"'\\s<>]*type=${type}[^"'\\s<>]*`);
        const match = html.match(re);
        if (match) return match[0];
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No ${type} email in InBucket for ${email} within 30s`);
}
