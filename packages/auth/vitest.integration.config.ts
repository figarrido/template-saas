import { defineConfig } from 'vitest/config';

// Integration suite. Runs the auth flow functions against the local
// Supabase stack; gated on `migration-validation` in CI. Mirrors the shape
// of `packages/db/vitest.config.ts` (forks pool, longer timeouts) because
// Supabase round-trips are slower than pure-Node tests.
export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    environment: 'node',
    pool: 'forks',
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
