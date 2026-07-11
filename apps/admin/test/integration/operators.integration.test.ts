import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from '@template/db';
import { listOperators, revokeOperator, resetOperatorMfa } from '../../lib/data/operators.js';
import {
  listPendingOperatorInvitations,
  revokeOperatorInvitation,
} from '../../lib/data/operator-invitations.js';
import { lookupAdminStatus } from '../../lib/data/admin.js';

// Integration suite for the admin operator management surface. Runs against
// the local Supabase stack; gated on `migration-validation` in CI.

const DATABASE_URL =
  process.env.WORKER_DATABASE_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54422/postgres';

const serviceSql = postgres(DATABASE_URL, { max: 4, prepare: false });

// Reuse the two seeded users to satisfy the admin_users → auth.users FK.
const USER_1 = '11111111-1111-1111-1111-111111111111';
const USER_2 = '22222222-2222-2222-2222-222222222222';

const INVITE_EMAIL = 'zzz-op-revoke@example.test';
const INVITE_TOKEN_HASH = 'zzz-op-revoke-hash';

const db = getServiceClient({ databaseUrl: DATABASE_URL });

beforeAll(async () => {
  await serviceSql`delete from public.admin_recovery_codes where user_id = ${USER_2}`;
  await serviceSql`delete from public.admin_users where user_id = ${USER_2}`;
  await serviceSql`delete from public.operator_invitations where email = ${INVITE_EMAIL}`;
});

afterAll(async () => {
  await serviceSql`delete from public.admin_recovery_codes where user_id = ${USER_2}`;
  await serviceSql`delete from public.admin_users where user_id = ${USER_2}`;
  await serviceSql`delete from public.operator_invitations where email = ${INVITE_EMAIL}`;
  await serviceSql.end({ timeout: 5 });
});

describe('revokeOperator', () => {
  it('active → revoked, gate denies, idempotent', async () => {
    await serviceSql`
      insert into public.admin_users (user_id, granted_by, revoked_at)
      values (${USER_2}, ${USER_1}, null)
      on conflict (user_id) do update set revoked_at = null, granted_by = ${USER_1}
    `;

    const result = await revokeOperator(db, { userId: USER_2 });
    expect(result.revoked).toBe(true);

    const stillActive = await lookupAdminStatus(USER_2);
    expect(stillActive).toBe(false);

    const second = await revokeOperator(db, { userId: USER_2 });
    expect(second.revoked).toBe(false);
  });
});

describe('listOperators', () => {
  it('returns active and revoked rows with email and status', async () => {
    await serviceSql`
      insert into public.admin_users (user_id, granted_by, revoked_at)
      values (${USER_2}, ${USER_1}, null)
      on conflict (user_id) do update set revoked_at = null, granted_by = ${USER_1}
    `;

    const active = await listOperators(db);
    const row2 = active.find((r) => r.userId === USER_2);
    expect(row2).toBeDefined();
    expect(row2?.status).toBe('active');
    expect(typeof row2?.email).toBe('string');
    expect(row2?.email.length).toBeGreaterThan(0);
    expect(active.some((r) => r.userId === USER_1)).toBe(true);

    await revokeOperator(db, { userId: USER_2 });

    const after = await listOperators(db);
    const revoked = after.find((r) => r.userId === USER_2);
    expect(revoked?.status).toBe('revoked');
    expect(revoked?.revokedAt).not.toBeNull();
  });
});

describe('revokeOperatorInvitation', () => {
  it('pending → revoked, drops from pending list, idempotent', async () => {
    const rows = await serviceSql<Array<{ operator_invitation_id: string }>>`
      insert into public.operator_invitations
        (email, token_hash, invited_by, status, expires_at)
      values
        (${INVITE_EMAIL}, ${INVITE_TOKEN_HASH}, ${USER_1}, 'pending', now() + interval '7 days')
      returning operator_invitation_id
    `;
    const id = rows[0]?.operator_invitation_id;
    if (!id) throw new Error('insert did not return id');

    const result = await revokeOperatorInvitation(db, { operatorInvitationId: id });
    expect(result.revoked).toBe(true);

    const statusRows = await serviceSql<Array<{ status: string }>>`
      select status from public.operator_invitations
      where operator_invitation_id = ${id}
    `;
    expect(statusRows[0]?.status).toBe('revoked');

    const pending = await listPendingOperatorInvitations(db);
    expect(pending.some((inv) => inv.operatorInvitationId === id)).toBe(false);

    const second = await revokeOperatorInvitation(db, { operatorInvitationId: id });
    expect(second.revoked).toBe(false);
  });
});

describe('resetOperatorMfa', () => {
  it('deletes every factor and clears recovery codes', async () => {
    await serviceSql`
      insert into public.admin_recovery_codes (user_id, code_hash)
      values
        (${USER_2}, 'hash-a'),
        (${USER_2}, 'hash-b')
      on conflict (user_id, code_hash) do nothing
    `;

    const deleted: Array<{ id: string; userId: string }> = [];
    const fakeAuth = {
      auth: {
        admin: {
          mfa: {
            listFactors: async () => ({
              data: { factors: [{ id: 'f1' }, { id: 'f2' }] },
              error: null,
            }),
            deleteFactor: async (p: { id: string; userId: string }) => {
              deleted.push(p);
              return { data: { id: p.id }, error: null };
            },
          },
        },
      },
    } as unknown as SupabaseClient;

    const result = await resetOperatorMfa(fakeAuth, db, { userId: USER_2 });
    expect(result.deletedFactorCount).toBe(2);
    expect(deleted).toContainEqual({ id: 'f1', userId: USER_2 });
    expect(deleted).toContainEqual({ id: 'f2', userId: USER_2 });

    const codeRows = await serviceSql`
      select count(*) as count from public.admin_recovery_codes
      where user_id = ${USER_2}
    `;
    expect(Number(codeRows[0]?.count)).toBe(0);
  });

  it('no factors is a no-op that does not throw', async () => {
    const fakeAuth = {
      auth: {
        admin: {
          mfa: {
            listFactors: async () => ({ data: { factors: [] }, error: null }),
            deleteFactor: async () => ({ data: null, error: null }),
          },
        },
      },
    } as unknown as SupabaseClient;

    const result = await resetOperatorMfa(fakeAuth, db, { userId: USER_2 });
    expect(result.deletedFactorCount).toBe(0);
  });
});
