import { describe, expect, it } from 'vitest';
import {
  generateRecoveryCodes,
  normalizeRecoveryCode,
  hashRecoveryCode,
  readJwtSessionId,
  signRecoveryElevation,
  verifyRecoveryElevation,
  RECOVERY_CODE_COUNT,
} from '../src/admin-mfa.js';

function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${header}.${body}.fakesig`;
}

describe('generateRecoveryCodes', () => {
  it(`returns ${RECOVERY_CODE_COUNT} codes`, () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
  });

  it('returns unique codes', () => {
    const codes = generateRecoveryCodes();
    expect(new Set(codes).size).toBe(RECOVERY_CODE_COUNT);
  });

  it('each code matches XXXXX-XXXXX format (Crockford-base32-ish alphabet)', () => {
    const codes = generateRecoveryCodes();
    for (const code of codes) {
      expect(code).toMatch(/^[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}$/);
    }
  });
});

describe('normalizeRecoveryCode', () => {
  it('strips non-alphanumeric chars and uppercases', () => {
    expect(normalizeRecoveryCode('ab cd-ef')).toBe('ABCDEF');
  });

  it('is idempotent on already-normalized codes', () => {
    expect(normalizeRecoveryCode('ABCDE12345')).toBe('ABCDE12345');
  });
});

describe('hashRecoveryCode', () => {
  it('is stable across formatting variants of the same code', async () => {
    const a = await hashRecoveryCode('ABCDE-12345');
    const b = await hashRecoveryCode('abcde 12345');
    const c = await hashRecoveryCode('ABCDE12345');
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('differs for different codes', async () => {
    const a = await hashRecoveryCode('ABCDE-12345');
    const b = await hashRecoveryCode('ZZZZZ-99999');
    expect(a).not.toBe(b);
  });

  it('returns a 64-character hex string (SHA-256)', async () => {
    const hash = await hashRecoveryCode('ABCDE-12345');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('readJwtSessionId', () => {
  it('returns session_id from a hand-built JWT payload', () => {
    const token = makeJwt({ session_id: 'sess-1', sub: 'user-1' });
    expect(readJwtSessionId(token)).toBe('sess-1');
  });

  it('returns null for empty string', () => {
    expect(readJwtSessionId('')).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(readJwtSessionId(undefined)).toBeNull();
  });

  it('returns null for null', () => {
    expect(readJwtSessionId(null)).toBeNull();
  });

  it('returns null for a token with too few segments', () => {
    expect(readJwtSessionId('not.a.jwt.x')).toBeNull();
  });

  it('returns null when session_id is absent from payload', () => {
    const token = makeJwt({ sub: 'user-1' });
    expect(readJwtSessionId(token)).toBeNull();
  });
});

describe('signRecoveryElevation / verifyRecoveryElevation', () => {
  const secret = 'test-secret-key';
  const userId = 'user-abc';
  const sessionId = 'session-xyz';

  it('round-trips true for matching (secret, userId, sessionId)', async () => {
    const cookie = await signRecoveryElevation(secret, userId, sessionId);
    expect(await verifyRecoveryElevation(secret, userId, sessionId, cookie)).toBe(true);
  });

  it('returns false for wrong userId', async () => {
    const cookie = await signRecoveryElevation(secret, userId, sessionId);
    expect(await verifyRecoveryElevation(secret, 'wrong-user', sessionId, cookie)).toBe(false);
  });

  it('returns false for wrong sessionId', async () => {
    const cookie = await signRecoveryElevation(secret, userId, sessionId);
    expect(await verifyRecoveryElevation(secret, userId, 'wrong-session', cookie)).toBe(false);
  });

  it('returns false for wrong secret', async () => {
    const cookie = await signRecoveryElevation(secret, userId, sessionId);
    expect(await verifyRecoveryElevation('wrong-secret', userId, sessionId, cookie)).toBe(false);
  });

  it('returns false for a tampered cookie', async () => {
    const cookie = await signRecoveryElevation(secret, userId, sessionId);
    const tampered = cookie.slice(0, -4) + 'XXXX';
    expect(await verifyRecoveryElevation(secret, userId, sessionId, tampered)).toBe(false);
  });

  it('returns false for a truncated cookie', async () => {
    const cookie = await signRecoveryElevation(secret, userId, sessionId);
    expect(await verifyRecoveryElevation(secret, userId, sessionId, cookie.slice(0, 8))).toBe(false);
  });

  it('returns false for null cookie', async () => {
    expect(await verifyRecoveryElevation(secret, userId, sessionId, null)).toBe(false);
  });
});
