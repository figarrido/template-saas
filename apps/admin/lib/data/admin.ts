import 'server-only';
import { eq, isNull, and } from 'drizzle-orm';
import { getServiceClient, schema } from '@template/db';
import { env } from '@template/env/admin';

// Admin app uses the service-role client per docs/architecture/02-data.md.
// The ESLint ban that prevents this import in apps/web is intentionally
// NOT applied here.

let _db: ReturnType<typeof getServiceClient> | undefined;
function db() {
  _db ??= getServiceClient({ databaseUrl: env.ADMIN_DATABASE_URL });
  return _db;
}

export async function lookupAdminStatus(userId: string): Promise<boolean> {
  const rows = await db()
    .select({ id: schema.admin_users.user_id })
    .from(schema.admin_users)
    .where(and(eq(schema.admin_users.user_id, userId), isNull(schema.admin_users.revoked_at)))
    .limit(1);
  return rows.length > 0;
}
