'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import type { ActionResult } from '@template/auth';
import { grantComp, revokeComp } from '@template/billing/entitlements';
import { requireOperator } from '@/lib/auth/gate';
import { getAdminDb } from '@/lib/data/db';
import { writeAdminAudit } from '@/lib/data/audit';
import { grantCompSchema, compExpiryToIso, type GrantCompInput } from '@/lib/schemas/comps';

export async function grantCompAction(
  organizationId: string,
  input: GrantCompInput,
): Promise<ActionResult<{ keys: string[] }>> {
  const actorUserId = await requireOperator();
  if (!z.string().uuid().safeParse(organizationId).success) {
    return { ok: false, error: 'Invalid organization.', code: 'invalid-input' };
  }
  const parsed = grantCompSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.', code: 'invalid-input' };
  }
  try {
    const { keys } = await grantComp(getAdminDb(), {
      organizationId,
      planId: parsed.data.planId,
      grantedBy: actorUserId,
      expiresAt: compExpiryToIso(parsed.data.expiresAt),
    });
    await writeAdminAudit({
      actorUserId,
      action: 'comp.granted',
      targetKind: 'organization',
      targetId: organizationId,
      metadata: { planId: parsed.data.planId, expiresAt: parsed.data.expiresAt, keys },
    });
    revalidatePath(`/organizations/${organizationId}`);
    return { ok: true, data: { keys } };
  } catch {
    return { ok: false, error: 'Could not grant the Comp.', code: 'unexpected' };
  }
}

export async function revokeCompAction(
  organizationId: string,
  planId: string,
): Promise<ActionResult> {
  const actorUserId = await requireOperator();
  if (
    !z.string().uuid().safeParse(organizationId).success ||
    !z.string().uuid().safeParse(planId).success
  ) {
    return { ok: false, error: 'Invalid input.', code: 'invalid-input' };
  }
  try {
    const { closed } = await revokeComp(getAdminDb(), { organizationId, planId });
    await writeAdminAudit({
      actorUserId,
      action: 'comp.revoked',
      targetKind: 'organization',
      targetId: organizationId,
      metadata: { planId, closedPeriods: closed },
    });
    revalidatePath(`/organizations/${organizationId}`);
    return { ok: true, data: undefined };
  } catch {
    return { ok: false, error: 'Could not revoke the Comp.', code: 'unexpected' };
  }
}
