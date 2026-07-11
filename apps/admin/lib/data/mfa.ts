import 'server-only';
import { eq, and, isNull } from 'drizzle-orm';
import { getServiceClient, schema } from '@template/db';
import { env } from '@template/env/admin';

let _db: ReturnType<typeof getServiceClient> | undefined;
function db() {
  _db ??= getServiceClient({ databaseUrl: env.ADMIN_DATABASE_URL });
  return _db;
}

export async function storeRecoveryCodes(userId: string, codeHashes: string[]): Promise<void> {
  await db().transaction(async (tx) => {
    await tx
      .delete(schema.admin_recovery_codes)
      .where(eq(schema.admin_recovery_codes.user_id, userId));
    if (codeHashes.length > 0) {
      await tx.insert(schema.admin_recovery_codes).values(
        codeHashes.map((code_hash) => ({ user_id: userId, code_hash })),
      );
    }
  });
}

export async function redeemRecoveryCode(userId: string, codeHash: string): Promise<boolean> {
  const rows = await db()
    .update(schema.admin_recovery_codes)
    .set({ used_at: new Date().toISOString() })
    .where(
      and(
        eq(schema.admin_recovery_codes.user_id, userId),
        eq(schema.admin_recovery_codes.code_hash, codeHash),
        isNull(schema.admin_recovery_codes.used_at),
      ),
    )
    .returning({ id: schema.admin_recovery_codes.admin_recovery_code_id });
  return rows.length === 1;
}
