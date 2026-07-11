import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Integration suite. Runs the admin org read API against the local
// Supabase stack; gated on `migration-validation` in CI. Mirrors the shape
// of `packages/billing/vitest.integration.config.ts` (forks pool, longer
// timeouts) because Supabase round-trips are slower than pure-Node tests.
export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    environment: 'node',
    pool: 'forks',
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      // Admin lib/ modules start with `import 'server-only'`. Next aliases that
      // at build time; vitest doesn't, so stub it to a no-op here. See stub.
      'server-only': fileURLToPath(new URL('./test/server-only-stub.ts', import.meta.url)),
    },
  },
});
