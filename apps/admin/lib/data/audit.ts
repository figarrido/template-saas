import 'server-only';
import { schema } from '@template/db';
import { getAdminDb } from './db';

export async function writeAdminAudit(entry: {
  actorUserId: string;
  action: string;
  targetKind: string;
  targetId: string | null;
  metadata: Record<string, unknown>;
}): Promise<void> {
  await getAdminDb().insert(schema.admin_audit_log).values({
    actor_user_id: entry.actorUserId,
    action: entry.action,
    target_kind: entry.targetKind,
    target_id: entry.targetId,
    metadata: entry.metadata,
  });
}
