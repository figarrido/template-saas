import { defineConfig } from 'vitest/config';

// Unit suite. Pure / fake-driven; runs in the per-PR `unit` job without
// needing a live Supabase stack. The companion integration suite is at
// `vitest.integration.config.ts` and runs in the `migration-validation` job
// alongside `@template/db`'s RLS suite.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**'],
    environment: 'node',
  },
});
