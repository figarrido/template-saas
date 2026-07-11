import type { ActionResult } from './types.js';
import { AUTH_MESSAGES } from './messages.js';
import { emailSchema, passwordSchema } from '../schemas.js';
import {
  generateOperatorInvitationToken,
  hashOperatorInvitationToken,
  operatorInvitationExpiry,
  isOperatorInvitationAcceptable,
  type OperatorInvitationStatus,
} from '../operator-invitations.js';

export type OperatorInvitationRow = {
  operatorInvitationId: string;
  email: string;
  status: OperatorInvitationStatus;
  expiresAt: string; // ISO
  invitedBy: string | null;
};

export interface OperatorInvitationPorts {
  now(): Date;
  isActiveOperatorEmail(email: string): Promise<boolean>;
  findPendingInvitationByEmail(email: string): Promise<OperatorInvitationRow | null>;
  createInvitation(input: {
    email: string;
    tokenHash: string;
    invitedBy: string;
    expiresAt: Date;
  }): Promise<{ operatorInvitationId: string }>;
  resendInvitation(input: {
    operatorInvitationId: string;
    tokenHash: string;
    invitedBy: string;
    expiresAt: Date;
  }): Promise<void>;
  findInvitationByTokenHash(tokenHash: string): Promise<OperatorInvitationRow | null>;
  markAccepted(input: { operatorInvitationId: string; acceptedAt: Date }): Promise<void>;
  findUserIdByEmail(email: string): Promise<string | null>;
  provisionUser(input: { email: string; password: string }): Promise<{ userId: string }>;
  grantOperator(input: { userId: string; grantedBy: string | null }): Promise<void>;
  writeAudit(entry: {
    actorUserId: string;
    action: string;
    targetKind: string;
    targetId: string | null;
    metadata: Record<string, unknown>;
  }): Promise<void>;
  sendInvitationEmail(input: {
    email: string;
    token: string;
    inviterEmail: string;
  }): Promise<void>;
}

export async function createOperatorInvitation(
  ports: OperatorInvitationPorts,
  input: { email: string; inviterUserId: string; inviterEmail: string },
): Promise<ActionResult<{ operatorInvitationId: string }>> {
  const parsed = emailSchema.safeParse(input.email);
  if (!parsed.success) {
    return { ok: false, error: AUTH_MESSAGES.operatorInviteInvalidEmail, code: 'invalid-input' };
  }
  const email = parsed.data;

  if (await ports.isActiveOperatorEmail(email)) {
    return { ok: false, error: AUTH_MESSAGES.operatorAlreadyActive, code: 'invalid-input' };
  }

  const token = generateOperatorInvitationToken();
  const tokenHash = await hashOperatorInvitationToken(token);
  const now = ports.now();
  const expiresAt = operatorInvitationExpiry(now);

  let id: string;
  let action: string;

  const existing = await ports.findPendingInvitationByEmail(email);
  if (existing) {
    await ports.resendInvitation({
      operatorInvitationId: existing.operatorInvitationId,
      tokenHash,
      invitedBy: input.inviterUserId,
      expiresAt,
    });
    id = existing.operatorInvitationId;
    action = 'operator_invitation.resent';
  } else {
    const created = await ports.createInvitation({
      email,
      tokenHash,
      invitedBy: input.inviterUserId,
      expiresAt,
    });
    id = created.operatorInvitationId;
    action = 'operator_invitation.created';
  }

  await ports.sendInvitationEmail({ email, token, inviterEmail: input.inviterEmail });
  await ports.writeAudit({
    actorUserId: input.inviterUserId,
    action,
    targetKind: 'operator_invitation',
    targetId: id,
    metadata: { email },
  });

  return { ok: true, data: { operatorInvitationId: id } };
}

export async function previewOperatorInvitation(
  ports: Pick<OperatorInvitationPorts, 'now' | 'findInvitationByTokenHash' | 'findUserIdByEmail'>,
  token: string,
): Promise<{ ok: false } | { ok: true; email: string; requiresPassword: boolean }> {
  if (!token) return { ok: false };

  const invitation = await ports.findInvitationByTokenHash(
    await hashOperatorInvitationToken(token),
  );
  if (!invitation) return { ok: false };
  if (!isOperatorInvitationAcceptable(invitation, ports.now())) return { ok: false };

  const existingUserId = await ports.findUserIdByEmail(invitation.email);
  return { ok: true, email: invitation.email, requiresPassword: existingUserId === null };
}

export async function acceptOperatorInvitation(
  ports: OperatorInvitationPorts,
  input: { token: string; password: string },
): Promise<ActionResult<{ userId: string }>> {
  if (!input.token) {
    return { ok: false, error: AUTH_MESSAGES.operatorInviteInvalid, code: 'invalid-input' };
  }

  const invitation = await ports.findInvitationByTokenHash(
    await hashOperatorInvitationToken(input.token),
  );
  if (!invitation) {
    return { ok: false, error: AUTH_MESSAGES.operatorInviteInvalid, code: 'invalid-input' };
  }

  if (!isOperatorInvitationAcceptable(invitation, ports.now())) {
    return { ok: false, error: AUTH_MESSAGES.operatorInviteInvalid, code: 'invalid-input' };
  }

  const existingUserId = await ports.findUserIdByEmail(invitation.email);

  let userId: string;
  if (existingUserId) {
    userId = existingUserId;
  } else {
    const parsedPw = passwordSchema.safeParse(input.password);
    if (!parsedPw.success) {
      return { ok: false, error: AUTH_MESSAGES.weakPassword, code: 'invalid-input' };
    }
    const provisioned = await ports.provisionUser({
      email: invitation.email,
      password: parsedPw.data,
    });
    userId = provisioned.userId;
  }

  await ports.grantOperator({ userId, grantedBy: invitation.invitedBy });
  await ports.markAccepted({
    operatorInvitationId: invitation.operatorInvitationId,
    acceptedAt: ports.now(),
  });
  await ports.writeAudit({
    actorUserId: userId,
    action: 'operator_invitation.accepted',
    targetKind: 'operator_invitation',
    targetId: invitation.operatorInvitationId,
    metadata: { email: invitation.email, provisioned: existingUserId === null },
  });

  return { ok: true, data: { userId } };
}
