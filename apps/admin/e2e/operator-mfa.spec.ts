import { expect, test } from '@playwright/test';
import { authenticator } from 'otplib';

// E2E: Operator MFA sign-in flow (ADR 0006). Requires a running local
// Supabase with the seeded admin@template.test / password operator.
// Runs only on main/release per CI (docs/architecture/08-platform.md).

test.describe('Operator MFA', () => {
  let totpSecret = '';
  const recoveryCodes: string[] = [];

  test('enroll → backoffice', async ({ page }) => {
    // Sign in as the seeded operator.
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@template.test');
    await page.fill('input[type="password"]', 'password');
    await page.click('button[type="submit"]');

    // Should land on /enroll because no TOTP factor exists yet.
    await page.waitForURL('**/enroll');

    // Read the displayed secret for TOTP code generation.
    const secretEl = page.locator('code').first();
    totpSecret = (await secretEl.textContent()) ?? '';
    expect(totpSecret).toBeTruthy();

    // Submit the TOTP code.
    const code = authenticator.generate(totpSecret);
    await page.fill('input[inputmode="numeric"]', code);
    await page.click('button[type="submit"]');

    // Assert recovery codes are shown.
    await page.waitForSelector('ul li');
    const codeItems = await page.locator('ul li').all();
    expect(codeItems.length).toBe(10);

    for (const item of codeItems) {
      const text = await item.textContent();
      if (text) recoveryCodes.push(text.trim());
    }

    // Continue to backoffice.
    await page.click('text=Continue to backoffice');
    await page.waitForURL('**/');
    await expect(page.locator('h1')).toContainText('Admin');
  });

  test('challenge on re-sign-in', async ({ page }) => {
    // Sign out then sign back in — should land on /challenge.
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@template.test');
    await page.fill('input[type="password"]', 'password');
    await page.click('button[type="submit"]');

    await page.waitForURL('**/challenge');

    const code = authenticator.generate(totpSecret);
    await page.fill('input[inputmode="numeric"]', code);
    await page.click('button[type="submit"]');

    await page.waitForURL('**/');
    await expect(page.locator('h1')).toContainText('Admin');
  });

  // Recovery code single-use enforcement.
  // NOTE: if local Supabase TOTP timing proves flaky, keep the cases above
  // as the required minimum and keep this test to document expected behavior.
  test('recovery redemption is single-use', async ({ page }) => {
    const recoveryCode = recoveryCodes[0];
    expect(recoveryCode).toBeTruthy();

    // Sign in, go to /challenge, switch to recovery code.
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@template.test');
    await page.fill('input[type="password"]', 'password');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/challenge');

    await page.click('text=Use a recovery code');
    await page.fill('input[autocomplete="off"]', recoveryCode!);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/');
    await expect(page.locator('h1')).toContainText('Admin');

    // Sign out, sign in again, and attempt the same recovery code.
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@template.test');
    await page.fill('input[type="password"]', 'password');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/challenge');

    await page.click('text=Use a recovery code');
    await page.fill('input[autocomplete="off"]', recoveryCode!);
    await page.click('button[type="submit"]');

    // Should stay on /challenge (rejected).
    await expect(page).toHaveURL(/challenge/);
  });

  test('non-operator signed-in user sees 404 at /', async ({ page }) => {
    // Sign in as a regular user (not in admin_users).
    await page.goto('/login');
    await page.fill('input[type="email"]', 'user@template.test');
    await page.fill('input[type="password"]', 'password');
    await page.click('button[type="submit"]');

    // The root must 404 — not redirect to enroll or challenge.
    const response = await page.goto('/');
    expect(response?.status()).toBe(404);
  });
});
