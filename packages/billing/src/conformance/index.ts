import { describe, expect, it } from 'vitest';
import type { BillingProvider } from '../provider.js';
import type { BillingEvent } from '../domain.js';

export type ConformanceFixture = {
  /** Verified-event shape the provider returns from `verifyWebhook`. */
  rawEvent: unknown;
  /** Expected normalized BillingEvent. Null = event not normalized (provider-specific). */
  expected: BillingEvent | null;
  label: string;
};

/**
 * Each BillingProvider adapter must pass this suite. New event types added
 * to BillingEvent should land here as a fixture before adapters claim
 * support.
 *
 * Usage from an adapter test:
 *
 *   import { runConformance } from '@template/billing/conformance';
 *   runConformance({ provider: new MyProvider(...), fixtures: [...] });
 */
export function runConformance({
  provider,
  fixtures,
}: {
  provider: BillingProvider;
  fixtures: ConformanceFixture[];
}): void {
  describe(`BillingProvider conformance: ${provider.name}`, () => {
    for (const fixture of fixtures) {
      it(`normalizes ${fixture.label}`, () => {
        const got = provider.normalizeWebhookEvent(fixture.rawEvent);
        expect(got).toEqual(fixture.expected);
      });
    }
  });
}
