import { defineConfig, devices } from '@playwright/test';

// Golden-path E2E. Runs on `main` and tags only — docs/architecture/08-platform.md
// § CI specifics: PR feedback under ~3 min; E2E + RLS gate main pushes.

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'https://template.localhost',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
