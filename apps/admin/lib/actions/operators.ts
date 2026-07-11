'use server';
import { createOperatorInvitation, acceptOperatorInvitation, type ActionResult } from '@template/auth';
import { requireOperator } from '@/lib/auth/gate';
import { getRequestClient } from '@/lib/supabase/server';
import { getOperatorInvitationPorts } from '@/lib/data/operator-invitations';

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
