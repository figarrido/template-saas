import { describe, expect, it } from 'vitest';
import { gateOn, type EntitlementsApi, type FlagsApi } from '../src/composition.js';

function ent(value: boolean): EntitlementsApi {
  return { has: async () => value };
}

function flag(value: boolean): FlagsApi {
  return { getBoolean: async () => value };
}

describe('gateOn', () => {
  it('opens when both entitlement and flag are true', async () => {
    expect(
      await gateOn({
        entitlements: ent(true),
        flags: flag(true),
        entitlementKey: 'pro',
        flagKey: 'new_dashboard',
        ctx: { organizationId: 'o-1' },
      }),
    ).toBe(true);
  });

  it('closes when entitlement is missing', async () => {
    expect(
      await gateOn({
        entitlements: ent(false),
        flags: flag(true),
        entitlementKey: 'pro',
        flagKey: 'new_dashboard',
        ctx: { organizationId: 'o-1' },
      }),
    ).toBe(false);
  });

  it('closes when flag is off', async () => {
    expect(
      await gateOn({
        entitlements: ent(true),
        flags: flag(false),
        entitlementKey: 'pro',
        flagKey: 'new_dashboard',
        ctx: { organizationId: 'o-1' },
      }),
    ).toBe(false);
  });

  it('closes when no organizationId in context', async () => {
    expect(
      await gateOn({
        entitlements: ent(true),
        flags: flag(true),
        entitlementKey: 'pro',
        flagKey: 'new_dashboard',
        ctx: {},
      }),
    ).toBe(false);
  });
});
