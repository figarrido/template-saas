import { describe, expect, it } from 'vitest';
import {
  gateAdmin,
  generateCspNonce,
  readActiveOrgFromCookie,
} from '../src/middleware-helpers.js';

describe('readActiveOrgFromCookie', () => {
  it('accepts a uuid', () => {
    expect(readActiveOrgFromCookie('33333333-3333-7333-8333-333333333333')).toBe(
      '33333333-3333-7333-8333-333333333333',
    );
  });
  it('rejects garbage', () => {
    expect(readActiveOrgFromCookie('not-a-uuid')).toBeNull();
    expect(readActiveOrgFromCookie(undefined)).toBeNull();
    expect(readActiveOrgFromCookie('')).toBeNull();
  });
});

describe('gateAdmin', () => {
  it('blocks no session', () => {
    expect(
      gateAdmin({ user: null }, { isAdmin: true, currentLevel: 'aal2', nextLevel: 'aal2', recoveryElevated: false }),
    ).toMatchObject({ ok: false, reason: 'no-session' });
  });

  it('blocks non-admin', () => {
    expect(
      gateAdmin({ user: { id: 'u-1' } }, { isAdmin: false, currentLevel: 'aal2', nextLevel: 'aal2', recoveryElevated: false }),
    ).toMatchObject({ ok: false, reason: 'not-admin' });
  });

  it('passes when session is already aal2 (recoveryElevated irrelevant)', () => {
    const r = gateAdmin(
      { user: { id: 'u-1' } },
      { isAdmin: true, currentLevel: 'aal2', nextLevel: 'aal2', recoveryElevated: false },
    );
    expect(r).toEqual({ ok: true, userId: 'u-1' });
  });

  it('passes when session is aal2 and recoveryElevated is true', () => {
    const r = gateAdmin(
      { user: { id: 'u-1' } },
      { isAdmin: true, currentLevel: 'aal2', nextLevel: 'aal2', recoveryElevated: true },
    );
    expect(r).toEqual({ ok: true, userId: 'u-1' });
  });

  it('returns enroll when nextLevel is aal1 (no verified factor)', () => {
    expect(
      gateAdmin({ user: { id: 'u-1' } }, { isAdmin: true, currentLevel: 'aal1', nextLevel: 'aal1', recoveryElevated: false }),
    ).toMatchObject({ ok: false, reason: 'enroll' });
  });

  it('returns challenge when nextLevel is aal2 and not recovery-elevated', () => {
    expect(
      gateAdmin({ user: { id: 'u-1' } }, { isAdmin: true, currentLevel: 'aal1', nextLevel: 'aal2', recoveryElevated: false }),
    ).toMatchObject({ ok: false, reason: 'challenge' });
  });

  it('passes when nextLevel is aal2 and recovery-elevated', () => {
    const r = gateAdmin(
      { user: { id: 'u-1' } },
      { isAdmin: true, currentLevel: 'aal1', nextLevel: 'aal2', recoveryElevated: true },
    );
    expect(r).toEqual({ ok: true, userId: 'u-1' });
  });

  it('returns enroll when both levels are null (defensive case)', () => {
    expect(
      gateAdmin({ user: { id: 'u-1' } }, { isAdmin: true, currentLevel: null, nextLevel: null, recoveryElevated: false }),
    ).toMatchObject({ ok: false, reason: 'enroll' });
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
