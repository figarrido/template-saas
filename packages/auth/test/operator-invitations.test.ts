import { describe, expect, it } from 'vitest';
import {
  generateOperatorInvitationToken,
  hashOperatorInvitationToken,
  operatorInvitationExpiry,
  isOperatorInvitationAcceptable,
  OPERATOR_INVITATION_TTL_DAYS,
} from '../src/operator-invitations.js';

describe('generateOperatorInvitationToken', () => {
  it('returns a URL-safe base64 string', () => {
    const token = generateOperatorInvitationToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('two calls produce different tokens', () => {
    const a = generateOperatorInvitationToken();
    const b = generateOperatorInvitationToken();
    expect(a).not.toBe(b);
  });
});

describe('hashOperatorInvitationToken', () => {
  it('is stable for the same token', async () => {
    const token = 'abc123';
    const a = await hashOperatorInvitationToken(token);
    const b = await hashOperatorInvitationToken(token);
    expect(a).toBe(b);
  });

  it('differs for different tokens', async () => {
    const a = await hashOperatorInvitationToken('aaa');
    const b = await hashOperatorInvitationToken('bbb');
    expect(a).not.toBe(b);
  });

  it('returns a 64-character hex string (SHA-256)', async () => {
    const hash = await hashOperatorInvitationToken('any-token');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('operatorInvitationExpiry', () => {
  it(`returns now + ${OPERATOR_INVITATION_TTL_DAYS} days`, () => {
    const now = new Date('2026-07-11T00:00:00Z');
    const expiry = operatorInvitationExpiry(now);
    expect(expiry.toISOString()).toBe('2026-07-18T00:00:00.000Z');
  });
});

describe('isOperatorInvitationAcceptable', () => {
  const now = new Date('2026-07-11T00:00:00Z');
  const future = '2026-07-18T00:00:00Z';
  const past = '2026-07-01T00:00:00Z';

  it('returns true for pending + future expiry', () => {
    expect(isOperatorInvitationAcceptable({ status: 'pending', expiresAt: future }, now)).toBe(true);
  });

  it('returns false for pending + past expiry', () => {
    expect(isOperatorInvitationAcceptable({ status: 'pending', expiresAt: past }, now)).toBe(false);
  });

  it('returns false for accepted + future expiry', () => {
    expect(isOperatorInvitationAcceptable({ status: 'accepted', expiresAt: future }, now)).toBe(false);
  });

  it('returns false for revoked + future expiry', () => {
    expect(isOperatorInvitationAcceptable({ status: 'revoked', expiresAt: future }, now)).toBe(false);
  });

  it('returns false for expired + future expiry', () => {
    expect(isOperatorInvitationAcceptable({ status: 'expired', expiresAt: future }, now)).toBe(false);
  });
});
