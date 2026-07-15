import 'server-only';
import { eq, and, desc, sql } from 'drizzle-orm';
import { schema, type ServiceClient } from '@template/db';
import { env } from '@template/env/admin';
import { selectEmailProvider } from '@template/email';
import { OperatorInviteEmail } from '@template/email/templates';
import type { OperatorInvitationPorts, OperatorInvitationRow } from '@template/auth';
import { getAdminDb } from './db';
import { getAdminAuthClient } from '../supabase/admin-auth';
import { lookupAdminStatus } from './admin';
import { writeAdminAudit } from './audit';

async function findUserIdByEmail(email: string): Promise<string | null> {
  // Reads auth.users email via the private.user_emails view — app_service has no
  // auth-schema grant (see supabase/migrations/*_app_service_role.sql).
  const rows = (await getAdminDb().execute(
    sql`select id from private.user_emails where lower(email) = ${email} limit 1`,
  )) as unknown as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}

export function getOperatorInvitationPorts(): OperatorInvitationPorts {
  return {
    now: () => new Date(),

    async findUserIdByEmail(email: string): Promise<string | null> {
      return findUserIdByEmail(email);
    },

    async isActiveOperatorEmail(email: string): Promise<boolean> {
      const userId = await findUserIdByEmail(email);
      return userId ? lookupAdminStatus(userId) : false;
    },

    async provisionUser({ email, password }): Promise<{ userId: string }> {
      const { data, error } = await getAdminAuthClient().auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !data.user) throw new Error('provisionUser failed');
      return { userId: data.user.id };
    },

    async grantOperator({ userId, grantedBy }): Promise<void> {
      await getAdminDb()
        .insert(schema.admin_users)
        .values({ user_id: userId, granted_by: grantedBy })
        .onConflictDoUpdate({
          target: schema.admin_users.user_id,
          set: { revoked_at: null, granted_by: grantedBy, granted_at: sql`now()` },
        });
    },

    async createInvitation({ email, tokenHash, invitedBy, expiresAt }): Promise<{
      operatorInvitationId: string;
    }> {
      const rows = await getAdminDb()
        .insert(schema.operator_invitations)
        .values({
          email,
          token_hash: tokenHash,
          invited_by: invitedBy,
          expires_at: expiresAt.toISOString(),
          status: 'pending',
        })
        .returning({
          id: schema.operator_invitations.operator_invitation_id,
        });
      const row = rows[0];
      if (!row) throw new Error('createInvitation failed');
      return { operatorInvitationId: row.id };
    },

    async resendInvitation({ operatorInvitationId, tokenHash, invitedBy, expiresAt }): Promise<void> {
      await getAdminDb()
        .update(schema.operator_invitations)
        .set({
          token_hash: tokenHash,
          invited_by: invitedBy,
          expires_at: expiresAt.toISOString(),
          status: 'pending',
        })
        .where(
          eq(schema.operator_invitations.operator_invitation_id, operatorInvitationId),
        );
    },

    async findPendingInvitationByEmail(email: string): Promise<OperatorInvitationRow | null> {
      const rows = await getAdminDb()
        .select()
        .from(schema.operator_invitations)
        .where(
          and(
            eq(sql`lower(${schema.operator_invitations.email})`, email),
            eq(schema.operator_invitations.status, 'pending'),
          ),
        )
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      return {
        operatorInvitationId: row.operator_invitation_id,
        email: row.email,
        status: row.status,
        expiresAt: row.expires_at,
        invitedBy: row.invited_by ?? null,
      };
    },

    async findInvitationByTokenHash(tokenHash: string): Promise<OperatorInvitationRow | null> {
      const rows = await getAdminDb()
        .select()
        .from(schema.operator_invitations)
        .where(eq(schema.operator_invitations.token_hash, tokenHash))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      return {
        operatorInvitationId: row.operator_invitation_id,
        email: row.email,
        status: row.status,
        expiresAt: row.expires_at,
        invitedBy: row.invited_by ?? null,
      };
    },

    async markAccepted({ operatorInvitationId, acceptedAt }): Promise<void> {
      await getAdminDb()
        .update(schema.operator_invitations)
        .set({ status: 'accepted', accepted_at: acceptedAt.toISOString() })
        .where(
          eq(schema.operator_invitations.operator_invitation_id, operatorInvitationId),
        );
    },

    async writeAudit(entry): Promise<void> {
      await writeAdminAudit(entry);
    },

    async sendInvitationEmail({ email, token, inviterEmail }): Promise<void> {
      const acceptUrl = new URL('/accept', env.NEXT_PUBLIC_SITE_URL);
      acceptUrl.searchParams.set('token', token);
      await selectEmailProvider().send({
        to: email,
        from: env.OPERATOR_EMAIL_FROM,
        subject: 'You have been invited as an Operator',
        react: OperatorInviteEmail({ inviterEmail, acceptUrl: acceptUrl.toString() }),
      });
    },
  };
}

export async function listPendingOperatorInvitations(
  db: ServiceClient,
): Promise<Array<{ operatorInvitationId: string; email: string; invitedAt: string; expiresAt: string }>> {
  const rows = await db
    .select({
      operatorInvitationId: schema.operator_invitations.operator_invitation_id,
      email: schema.operator_invitations.email,
      invitedAt: schema.operator_invitations.created_at,
      expiresAt: schema.operator_invitations.expires_at,
    })
    .from(schema.operator_invitations)
    .where(eq(schema.operator_invitations.status, 'pending'))
    .orderBy(desc(schema.operator_invitations.created_at));
  return rows;
}

export async function revokeOperatorInvitation(
  db: ServiceClient,
  { operatorInvitationId }: { operatorInvitationId: string },
): Promise<{ revoked: boolean }> {
  const rows = await db
    .update(schema.operator_invitations)
    .set({ status: 'revoked' })
    .where(
      and(
        eq(schema.operator_invitations.operator_invitation_id, operatorInvitationId),
        eq(schema.operator_invitations.status, 'pending'),
      ),
    )
    .returning({ id: schema.operator_invitations.operator_invitation_id });
  return { revoked: rows.length === 1 };
}
