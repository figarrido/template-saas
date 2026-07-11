'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createOperatorInvitation, acceptOperatorInvitation, type ActionResult } from '@template/auth';
import { requireOperator } from '@/lib/auth/gate';
import { getRequestClient } from '@/lib/supabase/server';
import { getAdminDb } from '@/lib/data/db';
import { getAdminAuthClient } from '@/lib/supabase/admin-auth';
import { writeAdminAudit } from '@/lib/data/audit';
import { revokeOperator, resetOperatorMfa } from '@/lib/data/operators';
import { revokeOperatorInvitation, getOperatorInvitationPorts } from '@/lib/data/operator-invitations';

export async function inviteOperatorAction(
  input: { email: string },
): Promise<ActionResult<{ operatorInvitationId: string }>> {
  const inviterUserId = await requireOperator();
  const { data } = await (await getRequestClient()).auth.getUser();
  const inviterEmail = data.user?.email ?? '';
  return createOperatorInvitation(getOperatorInvitationPorts(), {
    email: input.email,
    inviterUserId,
    inviterEmail,
  });
}

export async function acceptOperatorInvitationAction(
  input: { token: string; password: string },
): Promise<ActionResult<{ userId: string }>> {
  return acceptOperatorInvitation(getOperatorInvitationPorts(), input);
}

export async function revokeOperatorAction(userId: string): Promise<ActionResult> {
  const actorUserId = await requireOperator();
  if (!z.string().uuid().safeParse(userId).success) {
    return { ok: false, error: 'Invalid operator.', code: 'invalid-input' };
  }
  if (userId === actorUserId) {
    return { ok: false, error: 'You cannot revoke your own access.', code: 'invalid-input' };
  }
  try {
    const { revoked } = await revokeOperator(getAdminDb(), { userId });
    if (!revoked) {
      return { ok: false, error: 'Operator not found or already revoked.', code: 'invalid-input' };
    }
    await writeAdminAudit({
      actorUserId,
      action: 'operator.revoked',
      targetKind: 'operator',
      targetId: userId,
      metadata: {},
    });
    revalidatePath('/operators');
    return { ok: true, data: undefined };
  } catch {
    return { ok: false, error: 'Could not revoke the operator.', code: 'unexpected' };
  }
}

export async function revokeOperatorInvitationAction(
  operatorInvitationId: string,
): Promise<ActionResult> {
  const actorUserId = await requireOperator();
  if (!z.string().uuid().safeParse(operatorInvitationId).success) {
    return { ok: false, error: 'Invalid invitation.', code: 'invalid-input' };
  }
  try {
    const { revoked } = await revokeOperatorInvitation(getAdminDb(), { operatorInvitationId });
    if (!revoked) {
      return { ok: false, error: 'Invitation not found or no longer pending.', code: 'invalid-input' };
    }
    await writeAdminAudit({
      actorUserId,
      action: 'operator_invitation.revoked',
      targetKind: 'operator_invitation',
      targetId: operatorInvitationId,
      metadata: {},
    });
    revalidatePath('/operators');
    return { ok: true, data: undefined };
  } catch {
    return { ok: false, error: 'Could not revoke the invitation.', code: 'unexpected' };
  }
}

export async function resetOperatorMfaAction(userId: string): Promise<ActionResult> {
  const actorUserId = await requireOperator();
  if (!z.string().uuid().safeParse(userId).success) {
    return { ok: false, error: 'Invalid operator.', code: 'invalid-input' };
  }
  if (userId === actorUserId) {
    return { ok: false, error: 'You cannot reset your own MFA.', code: 'invalid-input' };
  }
  try {
    const { deletedFactorCount } = await resetOperatorMfa(getAdminAuthClient(), getAdminDb(), {
      userId,
    });
    await writeAdminAudit({
      actorUserId,
      action: 'operator.mfa_reset',
      targetKind: 'operator',
      targetId: userId,
      metadata: { deletedFactorCount },
    });
    revalidatePath('/operators');
    return { ok: true, data: undefined };
  } catch {
    return { ok: false, error: 'Could not reset the operator MFA.', code: 'unexpected' };
  }
}
