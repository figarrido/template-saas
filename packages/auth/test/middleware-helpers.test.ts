import { describe, expect, it } from 'vitest';
import {
  gateAdmin,
  generateCspNonce,
  readActiveOrgFromCookie,
} from '../src/middleware-helpers.js';

describe('readActiveOrgFromCookie', () => {
  it('accepts a uuid', () => {
    expect(readActiveOrgFromCookie('33333333-3333-3333-3333-333333333333')).toBe(
      '33333333-3333-3333-3333-333333333333',
    );
  });
  it('rejects garbage', () => {
    expect(readActiveOrgFromCookie('not-a-uuid')).toBeNull();
    expect(readActiveOrgFromCookie(undefined)).toBeNull();
    expect(readActiveOrgFromCookie('')).toBeNull();
  });
});

describe('gateAdmin', () => {
  it('passes when all three signals are present', () => {
    const r = gateAdmin(
      { user: { id: 'u-1' } },
      { isAdmin: true, mfaVerified: true },
    );
    expect(r).toEqual({ ok: true, userId: 'u-1' });
  });
  it('blocks no session', () => {
    expect(
      gateAdmin({ user: null }, { isAdmin: true, mfaVerified: true }),
    ).toMatchObject({ ok: false, reason: 'no-session' });
  });
  it('blocks non-admin', () => {
    expect(
      gateAdmin({ user: { id: 'u-1' } }, { isAdmin: false, mfaVerified: true }),
    ).toMatchObject({ ok: false, reason: 'not-admin' });
  });
  it('blocks mfa not verified', () => {
    expect(
      gateAdmin({ user: { id: 'u-1' } }, { isAdmin: true, mfaVerified: false }),
    ).toMatchObject({ ok: false, reason: 'mfa-not-verified' });
  });
});

describe('generateCspNonce', () => {
  it('produces a non-empty base64 string', () => {
    const nonce = generateCspNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(nonce.length).toBeGreaterThanOrEqual(16);
  });
  it('produces unique values', () => {
    expect(generateCspNonce()).not.toBe(generateCspNonce());
  });
});
