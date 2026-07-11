import { describe, expect, it } from 'vitest';
import { resolveActiveEntitlements, type EntitlementValue } from '../src/entitlements/index.js';

type Period = Parameters<typeof resolveActiveEntitlements>[0][number];

const billing = (value: EntitlementValue, expiresAt: string | null = null): Period => ({
  key: 'pro',
  value,
  source: 'billing',
  expiresAt,
});

const grant = (value: EntitlementValue, expiresAt: string | null = null): Period => ({
  key: 'pro',
  value,
  source: 'grant',
  expiresAt,
});

describe('resolveActiveEntitlements', () => {
  it('single period — returned once with its value', () => {
    const result = resolveActiveEntitlements([billing(true)]);
    expect(result).toHaveLength(1);
    expect(result[0]?.key).toBe('pro');
    expect(result[0]?.value).toBe(true);
  });

  it('two overlapping periods, same key, same source — returned once (deduped)', () => {
    const result = resolveActiveEntitlements([billing(5), billing(5)]);
    expect(result).toHaveLength(1);
    expect(result[0]?.key).toBe('pro');
  });

  it('grant wins over billing (billing-then-grant order)', () => {
    const result = resolveActiveEntitlements([billing(5), grant(10)]);
    expect(result).toHaveLength(1);
    expect(result[0]?.value).toBe(10);
  });

  it('grant wins over billing (grant-then-billing order)', () => {
    const result = resolveActiveEntitlements([grant(10), billing(5)]);
    expect(result).toHaveLength(1);
    expect(result[0]?.value).toBe(10);
  });

  it('grant and billing for same value — still one entry', () => {
    const result = resolveActiveEntitlements([billing(true), grant(true)]);
    expect(result).toHaveLength(1);
    expect(result[0]?.value).toBe(true);
  });

  it('expiresAt null — returned row has expiresAt undefined', () => {
    const result = resolveActiveEntitlements([billing(true, null)]);
    expect(result[0]?.expiresAt).toBeUndefined();
  });

  it('expiresAt timestamp — carried through from winning period', () => {
    const ts = '2027-01-01T00:00:00.000Z';
    const result = resolveActiveEntitlements([billing(true, ts)]);
    expect(result[0]?.expiresAt).toBe(ts);
  });
});
