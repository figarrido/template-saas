import { expect, test } from '@playwright/test';

// docs/architecture/03-auth.md § Admin enforcement: non-admin sessions and
// unauthenticated visitors get 404, not 403 — the admin surface gives away
// nothing to a probing client.
test('unauthenticated visitor sees 404 at the admin root', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(404);
});
