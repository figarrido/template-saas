import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { getServiceClient } from '@template/db';
import { listOrganizations, getOrganizationDetail, listActivePlans } from '../../lib/data/organizations.js';

// Integration suite for the admin org read API. Runs against the local
// Supabase stack; gated on `migration-validation` in CI alongside the
// billing integration suite.

const DATABASE_URL =
  process.env.WORKER_DATABASE_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54422/postgres';

const serviceSql = postgres(DATABASE_URL, { max: 4, prepare: false });

// Throwaway orgs — isolated from the seed tenant so tests don't stomp each other.
// IDs are distinct from the seed org and billing's aaaa... org.
const ORG_A = 'cccccccc-cccc-cccc-cccc-ccccccccccc1';
const ORG_B = 'cccccccc-cccc-cccc-cccc-ccccccccccc2';

// Reuse the two seeded users to satisfy the memberships → profiles → auth.users FK chain.
const USER_1 = '11111111-1111-1111-1111-111111111111';
const USER_2 = '22222222-2222-2222-2222-222222222222';

const db = getServiceClient({ databaseUrl: DATABASE_URL });

beforeAll(async () => {
  // Clean up any leftover state from a previous interrupted run.
  await serviceSql`delete from public.entitlements where organization_id in (${ORG_A}, ${ORG_B})`;
  await serviceSql`delete from public.memberships where organization_id in (${ORG_A}, ${ORG_B})`;
  await serviceSql`delete from public.organizations where organization_id in (${ORG_A}, ${ORG_B})`;

  await serviceSql`
    insert into public.organizations (organization_id, name, slug)
    values
      (${ORG_A}, 'Org Alpha Name', 'zzz-op-alpha'),
      (${ORG_B}, 'Org Beta Distinct', 'zzz-op-beta')
    on conflict (organization_id) do nothing
  `;

  // ORG_A has 2 members; ORG_B has 1.
  await serviceSql`
    insert into public.memberships (user_id, organization_id, role)
    values
      (${USER_1}, ${ORG_A}, 'owner'),
      (${USER_2}, ${ORG_A}, 'member'),
      (${USER_1}, ${ORG_B}, 'owner')
    on conflict (user_id, organization_id) do nothing
  `;
});

afterAll(async () => {
  await serviceSql`delete from public.entitlements where organization_id in (${ORG_A}, ${ORG_B})`;
  await serviceSql`delete from public.memberships where organization_id in (${ORG_A}, ${ORG_B})`;
  await serviceSql`delete from public.organizations where organization_id in (${ORG_A}, ${ORG_B})`;
  await serviceSql.end({ timeout: 5 });
});

describe('listOrganizations', () => {
  it('search by slug prefix returns both fixture orgs with correct member counts', async () => {
    const result = await listOrganizations(db, { search: 'zzz-op-' });
    const alpha = result.rows.find((r) => r.organizationId === ORG_A);
    const beta = result.rows.find((r) => r.organizationId === ORG_B);
    expect(alpha).toBeDefined();
    expect(beta).toBeDefined();
    expect(alpha?.memberCount).toBe(2);
    expect(beta?.memberCount).toBe(1);
    expect(typeof alpha?.name).toBe('string');
    expect(typeof alpha?.slug).toBe('string');
    expect(typeof alpha?.createdAt).toBe('string');
  });

  it('search matching only slug returns correct org', async () => {
    const result = await listOrganizations(db, { search: 'zzz-op-alpha' });
    expect(result.rows.some((r) => r.organizationId === ORG_A)).toBe(true);
    expect(result.rows.some((r) => r.organizationId === ORG_B)).toBe(false);
  });

  it('search matching only name returns correct org', async () => {
    const result = await listOrganizations(db, { search: 'Org Beta Distinct' });
    expect(result.rows.some((r) => r.organizationId === ORG_B)).toBe(true);
    expect(result.rows.some((r) => r.organizationId === ORG_A)).toBe(false);
  });

  it('pagination: page 1 has total >= 2; page 999 returns empty rows with same total', async () => {
    const page1 = await listOrganizations(db, { search: 'zzz-op-', page: 1 });
    expect(page1.total).toBeGreaterThanOrEqual(2);

    const page999 = await listOrganizations(db, { search: 'zzz-op-', page: 999 });
    expect(page999.rows).toHaveLength(0);
    expect(page999.total).toBe(page1.total);
  });
});

describe('getOrganizationDetail', () => {
  it('ORG_A has 2 members with roles', async () => {
    const detail = await getOrganizationDetail(db, ORG_A);
    expect(detail).not.toBeNull();
    expect(detail?.members).toHaveLength(2);
    for (const m of detail?.members ?? []) {
      expect(['owner', 'manager', 'member']).toContain(m.role);
    }
  });

  it('active entitlement for ORG_A appears with correct sourceLabel', async () => {
    await serviceSql`
      insert into public.entitlements
        (organization_id, key, value, source, starts_at, expires_at)
      values (
        ${ORG_A},
        'pro',
        'true'::jsonb,
        'billing',
        now(),
        null
      )
    `;
    try {
      const detail = await getOrganizationDetail(db, ORG_A);
      expect(detail?.entitlements).toHaveLength(1);
      expect(detail?.entitlements[0]?.sourceLabel).toBe('Billing');
    } finally {
      await serviceSql`delete from public.entitlements where organization_id = ${ORG_A}`;
    }
  });

  it('cross-org isolation: ORG_B has only its own member and no entitlements from ORG_A', async () => {
    const detail = await getOrganizationDetail(db, ORG_B);
    expect(detail).not.toBeNull();
    expect(detail?.members).toHaveLength(1);
    expect(detail?.members[0]?.userId).toBe(USER_1);
    expect(detail?.entitlements).toHaveLength(0);
  });

  it('nonexistent org returns null', async () => {
    const detail = await getOrganizationDetail(db, 'ffffffff-ffff-ffff-ffff-ffffffffffff');
    expect(detail).toBeNull();
  });
});

describe('listActivePlans', () => {
  it('returns the seeded Pro plan and all entries have string planId and name', async () => {
    const plans = await listActivePlans(db);
    const pro = plans.find((p) => p.name === 'Pro');
    expect(pro).toBeDefined();
    for (const p of plans) {
      expect(typeof p.planId).toBe('string');
      expect(typeof p.name).toBe('string');
    }
  });
});
