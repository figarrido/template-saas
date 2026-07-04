import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// Golden-path E2E. Runs on `main` and tags only — docs/architecture/08-platform.md
// § CI specifics: PR feedback under ~3 min; E2E + RLS gate main pushes.

// E2E must run against the SAME origin the auth emails link to
// (NEXT_PUBLIC_SITE_URL): after confirming a link the session cookie is set on
// that origin, and every subsequent authenticated navigation (/account/*, the
// org dashboard) has to share it. Resolution order:
//   1. E2E_BASE_URL — explicit override.
//   2. process.env.NEXT_PUBLIC_SITE_URL — how CI passes it (see main.yml).
//   3. apps/web/.env.local — where `pnpm setup` writes it locally; this
//      process doesn't otherwise load it, so read it directly. Locally that's
//      the portless dev proxy https://template.localhost.
//   4. http://localhost:3000 — last-resort default.
function resolveBaseUrl(): string {
  if (process.env.E2E_BASE_URL) return process.env.E2E_BASE_URL;
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  for (const candidate of ['.env.local', 'apps/web/.env.local']) {
    try {
      const match = readFileSync(resolve(process.cwd(), candidate), 'utf8').match(
        /^NEXT_PUBLIC_SITE_URL=(.+)$/m,
      );
      if (match?.[1]) return match[1].trim().replace(/^['"]|['"]$/g, '');
    } catch {
      // try the next candidate
    }
  }
  return 'http://localhost:3000';
}

const baseURL = resolveBaseUrl();

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // The auth specs ride a single shared dev server + Supabase stack, so email
  // round-trips contend under high parallelism. CI runs serially (1 worker);
  // locally cap at 2 and allow one retry to absorb transient email-timing lag.
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : 2,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    // The portless dev proxy serves a self-signed cert on https://*.localhost.
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    // Reused when a dev server is already up (local); started fresh in CI where
    // `pnpm start` serves the prod build on :3000 with a matching
    // NEXT_PUBLIC_SITE_URL. The health check targets :3000 either way.
    command: 'pnpm start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
