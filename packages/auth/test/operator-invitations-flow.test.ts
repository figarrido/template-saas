import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  createOperatorInvitation,
  acceptOperatorInvitation,
  previewOperatorInvitation,
} from '../src/flows/operator-invitations.js';
import type { OperatorInvitationPorts, OperatorInvitationRow } from '../src/flows/operator-invitations.js';

const FIXED_NOW = new Date('2026-07-11T00:00:00Z');
const FUTURE_EXPIRES = '2026-07-18T00:00:00.000Z';
const PAST_EXPIRES = '2026-07-01T00:00:00Z';

function makeRow(overrides: Partial<OperatorInvitationRow> = {}): OperatorInvitationRow {
  return {
    operatorInvitationId: 'inv-1',
    email: 'new@example.com',
    status: 'pending',
    expiresAt: FUTURE_EXPIRES,
    invitedBy: 'inviter-user-id',
    ...overrides,
  };
}

function makePorts(overrides: Partial<OperatorInvitationPorts> = {}): OperatorInvitationPorts {
  return {
    now: () => FIXED_NOW,
    isActiveOperatorEmail: vi.fn().mockResolvedValue(false),
    findPendingInvitationByEmail: vi.fn().mockResolvedValue(null),
    createInvitation: vi.fn().mockResolvedValue({ operatorInvitationId: 'inv-new' }),
    resendInvitation: vi.fn().mockResolvedValue(undefined),
    findInvitationByTokenHash: vi.fn().mockResolvedValue(null),
    markAccepted: vi.fn().mockResolvedValue(undefined),
    findUserIdByEmail: vi.fn().mockResolvedValue(null),
    provisionUser: vi.fn().mockResolvedValue({ userId: 'new-user-id' }),
    grantOperator: vi.fn().mockResolvedValue(undefined),
    writeAudit: vi.fn().mockResolvedValue(undefined),
    sendInvitationEmail: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('createOperatorInvitation', () => {
  it('happy path — new email', async () => {
    const ports = makePorts();
    const result = await createOperatorInvitation(ports, {
      email: 'new@example.com',
      inviterUserId: 'inviter-id',
      inviterEmail: 'inviter@example.com',
    });
    expect(result.ok).toBe(true);
    expect(ports.createInvitation).toHaveBeenCalledOnce();
    expect(ports.sendInvitationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'new@example.com', token: expect.stringMatching(/^[A-Za-z0-9_-]+$/) }),
    );
    expect(ports.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'operator_invitation.created' }),
    );
  });

  it('rejects already-active operator email', async () => {
    const ports = makePorts({
      isActiveOperatorEmail: vi.fn().mockResolvedValue(true),
    });
    const result = await createOperatorInvitation(ports, {
      email: 'active@example.com',
      inviterUserId: 'inviter-id',
      inviterEmail: 'inviter@example.com',
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('invalid-input');
    expect(ports.createInvitation).not.toHaveBeenCalled();
    expect(ports.sendInvitationEmail).not.toHaveBeenCalled();
  });

  it('reuses pending invitation row on re-invite', async () => {
    const existing = makeRow();
    const ports = makePorts({
      findPendingInvitationByEmail: vi.fn().mockResolvedValue(existing),
    });
    const result = await createOperatorInvitation(ports, {
      email: 'new@example.com',
      inviterUserId: 'inviter-id',
      inviterEmail: 'inviter@example.com',
    });
    expect(result.ok).toBe(true);
    expect(ports.resendInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ operatorInvitationId: 'inv-1' }),
    );
    expect(ports.createInvitation).not.toHaveBeenCalled();
    expect(ports.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'operator_invitation.resent' }),
    );
  });

  it('rejects invalid email', async () => {
    const ports = makePorts();
    const result = await createOperatorInvitation(ports, {
      email: 'nope',
      inviterUserId: 'inviter-id',
      inviterEmail: 'inviter@example.com',
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('invalid-input');
    expect(ports.createInvitation).not.toHaveBeenCalled();
    expect(ports.sendInvitationEmail).not.toHaveBeenCalled();
    expect(ports.writeAudit).not.toHaveBeenCalled();
  });
});

describe('acceptOperatorInvitation', () => {
  const VALID_TOKEN = 'valid-token-string';

  it('provisions new user on accept', async () => {
    const row = makeRow();
    const ports = makePorts({
      findInvitationByTokenHash: vi.fn().mockResolvedValue(row),
      findUserIdByEmail: vi.fn().mockResolvedValue(null),
    });
    const result = await acceptOperatorInvitation(ports, {
      token: VALID_TOKEN,
      password: 'StrongPass123!',
    });
    expect(result.ok).toBe(true);
    expect(ports.provisionUser).toHaveBeenCalledOnce();
    expect(ports.grantOperator).toHaveBeenCalledWith(
      expect.objectContaining({ grantedBy: row.invitedBy }),
    );
    expect(ports.markAccepted).toHaveBeenCalledOnce();
    expect(ports.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'operator_invitation.accepted',
        metadata: expect.objectContaining({ provisioned: true }),
      }),
    );
  });

  it('rejects new user with empty password', async () => {
    const row = makeRow();
    const ports = makePorts({
      findInvitationByTokenHash: vi.fn().mockResolvedValue(row),
      findUserIdByEmail: vi.fn().mockResolvedValue(null),
    });
    const result = await acceptOperatorInvitation(ports, {
      token: VALID_TOKEN,
      password: '',
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('invalid-input');
    expect(ports.provisionUser).not.toHaveBeenCalled();
  });

  it('reuses existing user (no provisioning)', async () => {
    const row = makeRow();
    const ports = makePorts({
      findInvitationByTokenHash: vi.fn().mockResolvedValue(row),
      findUserIdByEmail: vi.fn().mockResolvedValue('existing-u1'),
    });
    const result = await acceptOperatorInvitation(ports, {
      token: VALID_TOKEN,
      password: '',
    });
    expect(result.ok).toBe(true);
    expect(ports.provisionUser).not.toHaveBeenCalled();
    expect(ports.grantOperator).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'existing-u1' }),
    );
    expect(ports.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ provisioned: false }),
      }),
    );
  });

  it('rejects invalid token (not found)', async () => {
    const ports = makePorts({
      findInvitationByTokenHash: vi.fn().mockResolvedValue(null),
    });
    const result = await acceptOperatorInvitation(ports, {
      token: VALID_TOKEN,
      password: 'StrongPass123!',
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('invalid-input');
  });

  it('rejects expired invitation', async () => {
    const row = makeRow({ expiresAt: PAST_EXPIRES });
    const ports = makePorts({
      findInvitationByTokenHash: vi.fn().mockResolvedValue(row),
    });
    const result = await acceptOperatorInvitation(ports, {
      token: VALID_TOKEN,
      password: 'StrongPass123!',
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('invalid-input');
    expect(ports.grantOperator).not.toHaveBeenCalled();
    expect(ports.provisionUser).not.toHaveBeenCalled();
  });

  it('rejects already-accepted invitation', async () => {
    const row = makeRow({ status: 'accepted' });
    const ports = makePorts({
      findInvitationByTokenHash: vi.fn().mockResolvedValue(row),
    });
    const result = await acceptOperatorInvitation(ports, {
      token: VALID_TOKEN,
      password: 'StrongPass123!',
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.code).toBe('invalid-input');
  });
});

describe('previewOperatorInvitation', () => {
  const VALID_TOKEN = 'preview-token';

  it('returns ok:false for empty token', async () => {
    const ports = makePorts();
    const result = await previewOperatorInvitation(ports, '');
    expect(result.ok).toBe(false);
  });

  it('returns ok:false for unknown token', async () => {
    const ports = makePorts({
      findInvitationByTokenHash: vi.fn().mockResolvedValue(null),
    });
    const result = await previewOperatorInvitation(ports, VALID_TOKEN);
    expect(result.ok).toBe(false);
  });

  it('returns ok:false for expired invitation', async () => {
    const row = makeRow({ expiresAt: PAST_EXPIRES });
    const ports = makePorts({
      findInvitationByTokenHash: vi.fn().mockResolvedValue(row),
    });
    const result = await previewOperatorInvitation(ports, VALID_TOKEN);
    expect(result.ok).toBe(false);
  });

  it('returns requiresPassword:true when no existing user', async () => {
    const row = makeRow();
    const ports = makePorts({
      findInvitationByTokenHash: vi.fn().mockResolvedValue(row),
      findUserIdByEmail: vi.fn().mockResolvedValue(null),
    });
    const result = await previewOperatorInvitation(ports, VALID_TOKEN);
    expect(result.ok).toBe(true);
    expect(result.ok && result.requiresPassword).toBe(true);
    expect(result.ok && result.email).toBe(row.email);
  });

  it('returns requiresPassword:false when existing user', async () => {
    const row = makeRow();
    const ports = makePorts({
      findInvitationByTokenHash: vi.fn().mockResolvedValue(row),
      findUserIdByEmail: vi.fn().mockResolvedValue('existing-u1'),
    });
    const result = await previewOperatorInvitation(ports, VALID_TOKEN);
    expect(result.ok).toBe(true);
    expect(result.ok && result.requiresPassword).toBe(false);
  });
});
