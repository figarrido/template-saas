import 'server-only';
import { eq, isNull, and } from 'drizzle-orm';
import { schema } from '@template/db';
import { getAdminDb } from './db';

// Admin app uses the service-role client per docs/architecture/02-data.md.
// The ESLint ban that prevents this import in apps/web is intentionally
// NOT applied here.

export async function lookupAdminStatus(userId: string): Promise<boolean> {
  const rows = await getAdminDb()
    .select({ id: schema.admin_users.user_id })
    .from(schema.admin_users)
    .where(and(eq(schema.admin_users.user_id, userId), isNull(schema.admin_users.revoked_at)))
    .limit(1);
  return rows.length > 0;
}
