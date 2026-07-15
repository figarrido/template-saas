import 'server-only';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { SupabaseClient } from '@supabase/supabase-js';
import { schema, type ServiceClient } from '@template/db';

// Admin app uses the service-role client per docs/architecture/02-data.md.

export type OperatorRow = {
  userId: string;
  email: string;
  status: 'active' | 'revoked';
  grantedAt: string;
  revokedAt: string | null;
};

/** All Operators, active and revoked. Email comes from auth.users, read through
 *  the private.user_emails view because app_service has no auth-schema grant
 *  (see supabase/migrations/*_app_service_role.sql). Raw SQL — email is not
 *  modeled in Drizzle — same approach as findUserIdByEmail. */
export async function listOperators(db: ServiceClient): Promise<OperatorRow[]> {
  const rows = (await db.execute(sql`
    select
      au.user_id    as "userId",
      u.email       as "email",
      au.granted_at as "grantedAt",
      au.revoked_at as "revokedAt"
    from public.admin_users au
    join private.user_emails u on u.id = au.user_id
    order by (au.revoked_at is null) desc, au.granted_at desc
  `)) as unknown as Array<{
    userId: string;
    email: string;
    grantedAt: string;
    revokedAt: string | null;
  }>;
  return rows.map((r) => ({
    userId: r.userId,
    email: r.email,
    grantedAt: r.grantedAt,
    revokedAt: r.revokedAt,
    status: r.revokedAt === null ? 'active' : 'revoked',
  }));
}

/** Revoke an Operator (sets revoked_at) only if currently active. Returns
 *  whether a row was affected — false means already-revoked / not an Operator. */
export async function revokeOperator(
  db: ServiceClient,
  { userId }: { userId: string },
): Promise<{ revoked: boolean }> {
  const rows = await db
    .update(schema.admin_users)
    .set({ revoked_at: sql`now()` })
    .where(and(eq(schema.admin_users.user_id, userId), isNull(schema.admin_users.revoked_at)))
    .returning({ id: schema.admin_users.user_id });
  return { revoked: rows.length === 1 };
}

/** Reset a peer's MFA: delete every Supabase MFA factor (deleting a verified
 *  factor logs them out of all sessions), then clear their recovery codes so no
 *  stale code survives. On next sign-in the mandatory gate forces re-enrollment.
 *  ADR 0006 recovery-ladder rung 2. `authClient` must be the service-role admin
 *  client (getAdminAuthClient) — admin.mfa requires the service role. */
export async function resetOperatorMfa(
  authClient: SupabaseClient,
  db: ServiceClient,
  { userId }: { userId: string },
): Promise<{ deletedFactorCount: number }> {
  const { data, error } = await authClient.auth.admin.mfa.listFactors({ userId });
  if (error) throw error;
  const factors = data?.factors ?? [];
  for (const factor of factors) {
    const { error: deleteError } = await authClient.auth.admin.mfa.deleteFactor({
      id: factor.id,
      userId,
    });
    if (deleteError) throw deleteError;
  }
  await db
    .delete(schema.admin_recovery_codes)
    .where(eq(schema.admin_recovery_codes.user_id, userId));
  return { deletedFactorCount: factors.length };
}
