import { describe, expect, it } from 'vitest';
import { initSentry, Sentry } from '../src/sentry.js';

// Sentry's getCurrentScope().getClient() returns undefined when init never
// ran. We assert that init returns early outside production and without DSN.
describe('sentry init guard', () => {
  it('no-ops outside production', () => {
    initSentry({ service: 'svc', dsn: 'https://example@o0.ingest.sentry.io/0', env: 'development' });
    expect(Sentry.getCurrentScope().getClient()).toBeUndefined();
  });

  it('no-ops in production without DSN', () => {
    initSentry({ service: 'svc', dsn: undefined, env: 'production' });
    expect(Sentry.getCurrentScope().getClient()).toBeUndefined();
  });
});
