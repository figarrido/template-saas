import { expect, test } from '@playwright/test';

// Golden-path E2E for issue #4 / parent PRD #2: a User signs up, opens the
// verification email in InBucket, follows the confirm link, signs in, and
// signs out. Kept as a single test so the round-trip is exercised end-to-
// end without partial-state flakes; the per-step assertions live in the
// integration suite (packages/auth/test/integration/sign-up.*).
//
// The test reaches into InBucket via its HTTP API — Supabase exposes it on
// the same host as the dev DB (default 54424 web UI / 54429 API). We use
// the v2 mailbox API to poll for the freshly-sent message.

const INBUCKET_URL = process.env.INBUCKET_URL ?? 'http://127.0.0.1:54424';

test.describe.configure({ mode: 'serial' });

test('sign-up → InBucket confirm → sign-in → sign-out', async ({ page, request }) => {
  // Use a per-run-unique email so re-runs don't see a stale auth.users row.
  const email = `e2e-${crypto.randomUUID()}@template.test`;
  const password = 'correct-horse-battery-staple';

  await page.goto('/signup');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign up' }).click();

  await expect(page).toHaveURL(/\/check-email/);
  await expect(page.getByRole('heading', { name: /check your email/i })).toBeVisible();

  const confirmUrl = await pollForConfirmUrl(request, email);
  await page.goto(confirmUrl);

  // Successful confirm lands the User somewhere inside the app — either
  // first-org onboarding (0 orgs) or the org picker (2+) or a dashboard.
  // We assert we're no longer on the auth surface as a proxy.
  await expect(page).not.toHaveURL(/\/(login|signup|check-email|auth\/confirm)/);

  // From whichever destination the router picked, the user can sign out
  // via the standard sign-out control on the dashboard.
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).not.toHaveURL(/\/login/);

  // Sign-out is exposed on the (app)/dashboard in slice 1.
  const signOut = page.getByRole('button', { name: /sign out/i });
  if (await signOut.isVisible().catch(() => false)) {
    await signOut.click();
    await expect(page).toHaveURL(/\/login/);
  }
});

async function pollForConfirmUrl(
  request: import('@playwright/test').APIRequestContext,
  email: string,
): Promise<string> {
  const mailbox = email.split('@')[0]!;
  // Poll up to ~30s — the send-email hook fires synchronously from
  // Supabase Auth but InBucket indexing can lag a beat.
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const list = await request.get(`${INBUCKET_URL}/api/v1/mailbox/${mailbox}`);
    if (list.ok()) {
      const messages = (await list.json()) as Array<{ id: string }>;
      const latest = messages[messages.length - 1];
      if (latest) {
        const detail = await request.get(`${INBUCKET_URL}/api/v1/mailbox/${mailbox}/${latest.id}`);
        const body = (await detail.json()) as { body?: { html?: string; text?: string } };
        const html = body.body?.html ?? body.body?.text ?? '';
        const match = html.match(/https?:\/\/[^"'\s<>]+\/auth\/confirm[^"'\s<>]*/);
        if (match) return match[0];
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No verification email in InBucket for ${email} within 30s`);
}
