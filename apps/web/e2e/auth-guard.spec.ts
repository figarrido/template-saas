import { expect, test } from '@playwright/test';

// Regression guard for the (app) route group. Every route under (app) queries
// RLS-scoped tables (e.g. OrgSwitcher -> getMyOrganizations reads `memberships`),
// which the `anon` role has no grant for. Before apps/web/app/(app)/layout.tsx,
// an unauthenticated render reached those queries as `anon` and threw
// "permission denied for table memberships" instead of bouncing to login — the
// exact failure hit by the sign-out re-render. The layout's getClaims() guard
// must redirect an unauthenticated visitor to /login before any query runs.
//
// A fresh Playwright context carries no session cookie, so `page.goto` here is
// the unauthenticated case by construction.

for (const path of ['/orgs', '/some-org/dashboard', '/account/change-password']) {
  test(`unauthenticated ${path} redirects to /login`, async ({ page }) => {
    await page.goto(path);

    await expect(page).toHaveURL(/\/login(\?|$)/);
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });
}
