import { expect, test } from '@playwright/test';

test('marketing landing renders log-in and sign-up CTAs', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Template SaaS' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign up' })).toBeVisible();
});

test('login form renders with email + password fields', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});
