import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { getServiceClient } from '@template/db';
import {
  createEntitlements,
  listActiveEntitlementPeriods,
  grantComp,
  revokeComp,
  listActiveComps,
} from '../../src/entitlements/index.js';

// Integration suite for the entitlements read API. Runs against the local
// Supabase stack; gated on `migration-validation` in CI alongside the RLS
// suite and auth integration tests (packages/auth/vitest.integration.config.ts).

const DATABASE_URL =
  process.env.WORKER_DATABASE_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54422/postgres';

const serviceSql = postgres(DATABASE_URL, { max: 4, prepare: false });

// Throwaway org — isolated from the seed tenant so tests don't stomp each other.
const ORG_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// Seeded plan with a plan_entitlements → 'pro' mapping.
const SEED_PLAN = '44444444-4444-4444-4444-444444444444';
// Seeded user to satisfy the granted_by FK.
const USER_1 = '11111111-1111-1111-1111-111111111111';
// Throwaway plan with no plan_entitlements (for the "empty plan rejects" case).
const EMPTY_PLAN = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const db = getServiceClient({ databaseUrl: DATABASE_URL });
const entitlements = createEntitlements(db);

beforeAll(async () => {
  // Clean up any leftover state from a previous interrupted run.
  await serviceSql`delete from public.entitlements where organization_id = ${ORG_ID}`;
  await serviceSql`delete from public.memberships where organization_id = ${ORG_ID}`;
  await serviceSql`delete from public.organizations where organization_id = ${ORG_ID}`;
  await serviceSql`delete from public.plan_entitlements where plan_id = ${EMPTY_PLAN}`;
  await serviceSql`delete from public.plans where plan_id = ${EMPTY_PLAN}`;

  await serviceSql`
    insert into public.organizations (organization_id, name, slug)
    values (${ORG_ID}, 'Entitlement Test Org', 'entitlement-test-org')
    on conflict (organization_id) do nothing
  `;

  // Empty plan with no plan_entitlements for the "empty plan rejects" case.
  await serviceSql`
    insert into public.plans (plan_id, slug, name, is_active)
    values (${EMPTY_PLAN}, 'zzz-empty-plan', 'Empty Plan', true)
    on conflict (plan_id) do nothing
  `;
});

afterAll(async () => {
  await serviceSql`delete from public.entitlements where organization_id = ${ORG_ID}`;
  await serviceSql`delete from public.organizations where organization_id = ${ORG_ID}`;
  await serviceSql`delete from public.plan_entitlements where plan_id = ${EMPTY_PLAN}`;
  await serviceSql`delete from public.plans where plan_id = ${EMPTY_PLAN}`;
  await serviceSql.end({ timeout: 5 });
});

// `startsAt`/`expiresAt` are SQL fragments (e.g. serviceSql`now() - interval
// '1 day'`), not strings: they must be inlined as SQL so `now()`/`interval`
// evaluate on the DB clock. Passed as bound parameters they'd reach Postgres
// as opaque text and fail to cast to timestamptz. Mirrors packages/auth's
// integration setup (serviceSql`now()`).
async function insertPeriod(opts: {
  source?: string;
  value?: string;
  startsAt?: postgres.Fragment;
  expiresAt?: postgres.Fragment;
}): Promise<string> {
  const source = opts.source ?? 'billing';
  const value = opts.value ?? 'true';
  const startsAt = opts.startsAt ?? serviceSql`now() - interval '1 day'`;
  const expiresAt = opts.expiresAt ?? null;

  const rows = await serviceSql`
    insert into public.entitlements
      (organization_id, key, value, source, starts_at, expires_at)
    values (
      ${ORG_ID},
      'pro',
      ${value}::jsonb,
      ${source},
      ${startsAt},
      ${expiresAt}
    )
    returning entitlement_id
  `;
  return (rows[0] as { entitlement_id: string }).entitlement_id;
}

async function deleteById(id: string): Promise<void> {
  await serviceSql`delete from public.entitlements where entitlement_id = ${id}`;
}

describe('entitlements read API — temporal window', () => {
  it('active period (starts_at past, no expiry) → has=true; list contains pro once', async () => {
    const id = await insertPeriod({ startsAt: serviceSql`now() - interval '1 day'` });
    try {
      expect(await entitlements.has(ORG_ID, 'pro')).toBe(true);
      const list = await entitlements.list(ORG_ID);
      expect(list.filter((r) => r.key === 'pro')).toHaveLength(1);
    } finally {
      await deleteById(id);
    }
  });

  it('future period (starts_at tomorrow) only → has=false; list omits pro', async () => {
    const id = await insertPeriod({ startsAt: serviceSql`now() + interval '1 day'` });
    try {
      expect(await entitlements.has(ORG_ID, 'pro')).toBe(false);
      const list = await entitlements.list(ORG_ID);
      expect(list.filter((r) => r.key === 'pro')).toHaveLength(0);
    } finally {
      await deleteById(id);
    }
  });

  it('expired period (expires_at in past) only → has=false; list omits pro', async () => {
    const id = await insertPeriod({ expiresAt: serviceSql`now() - interval '1 hour'` });
    try {
      expect(await entitlements.has(ORG_ID, 'pro')).toBe(false);
      const list = await entitlements.list(ORG_ID);
      expect(list.filter((r) => r.key === 'pro')).toHaveLength(0);
    } finally {
      await deleteById(id);
    }
  });

  it('org with no periods → has=false; list returns []', async () => {
    expect(await entitlements.has(ORG_ID, 'pro')).toBe(false);
    expect(await entitlements.list(ORG_ID)).toEqual([]);
  });
});

describe('entitlements read API — coexistence and precedence', () => {
  it('two overlapping active periods coexist; list dedupes; grant value wins', async () => {
    // No unique constraint on (org, key) anymore — both rows must insert cleanly.
    const billingId = await insertPeriod({ source: 'billing', value: '5' });
    const grantId = await insertPeriod({ source: 'grant', value: '10' });
    try {
      expect(await entitlements.has(ORG_ID, 'pro')).toBe(true);
      const list = await entitlements.list(ORG_ID);
      const proEntries = list.filter((r) => r.key === 'pro');
      expect(proEntries).toHaveLength(1);
      expect(proEntries[0]?.value).toBe(10);
    } finally {
      await deleteById(billingId);
      await deleteById(grantId);
    }
  });
});

describe('Comp write path', () => {
  // Future expiry ~30 days out.
  const futureExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  it('grant expands the plan into source=grant rows', async () => {
    try {
      const result = await grantComp(db, {
        organizationId: ORG_ID,
        planId: SEED_PLAN,
        grantedBy: USER_1,
        expiresAt: futureExpiry,
      });
      expect(result.keys).toContain('pro');

      expect(await entitlements.has(ORG_ID, 'pro')).toBe(true);

      const periods = await listActiveEntitlementPeriods(db, ORG_ID);
      expect(periods.some((p) => p.source === 'grant')).toBe(true);

      const comps = await listActiveComps(db, ORG_ID);
      expect(comps).toHaveLength(1);
      expect(comps[0]?.planId).toBe(SEED_PLAN);
      expect(comps[0]?.planName).toBe('Pro');
      expect(comps[0]?.keys).toContain('pro');
      expect(comps[0]?.expiresAt).not.toBeNull();
    } finally {
      await serviceSql`delete from public.entitlements where organization_id = ${ORG_ID}`;
    }
  });

  it('revoke closes the grant', async () => {
    await grantComp(db, {
      organizationId: ORG_ID,
      planId: SEED_PLAN,
      grantedBy: USER_1,
      expiresAt: futureExpiry,
    });
    try {
      const { closed } = await revokeComp(db, { organizationId: ORG_ID, planId: SEED_PLAN });
      expect(closed).toBeGreaterThanOrEqual(1);

      expect(await entitlements.has(ORG_ID, 'pro')).toBe(false);
      expect(await listActiveComps(db, ORG_ID)).toHaveLength(0);
    } finally {
      await serviceSql`delete from public.entitlements where organization_id = ${ORG_ID}`;
    }
  });

  it('coexistence: revoking comp leaves billing period intact', async () => {
    const billingId = await insertPeriod({ source: 'billing' });
    await grantComp(db, {
      organizationId: ORG_ID,
      planId: SEED_PLAN,
      grantedBy: USER_1,
      expiresAt: futureExpiry,
    });
    try {
      await revokeComp(db, { organizationId: ORG_ID, planId: SEED_PLAN });
      expect(await entitlements.has(ORG_ID, 'pro')).toBe(true);
      expect(await listActiveComps(db, ORG_ID)).toHaveLength(0);
    } finally {
      await deleteById(billingId);
      await serviceSql`delete from public.entitlements where organization_id = ${ORG_ID}`;
    }
  });

  it('empty plan rejects with no rows inserted', async () => {
    await expect(
      grantComp(db, {
        organizationId: ORG_ID,
        planId: EMPTY_PLAN,
        grantedBy: USER_1,
        expiresAt: futureExpiry,
      }),
    ).rejects.toThrow();
    expect(await entitlements.has(ORG_ID, 'pro')).toBe(false);
  });
});

describe('listActiveEntitlementPeriods', () => {
  it('single active billing period → one row with correct fields', async () => {
    const id = await insertPeriod({ source: 'billing', startsAt: serviceSql`now() - interval '1 day'` });
    try {
      const periods = await listActiveEntitlementPeriods(db, ORG_ID);
      expect(periods).toHaveLength(1);
      expect(periods[0]?.source).toBe('billing');
      expect(typeof periods[0]?.startsAt).toBe('string');
      expect(periods[0]?.expiresAt).toBeNull();
    } finally {
      await deleteById(id);
    }
  });

  it('coexisting billing + grant periods → two rows (no dedupe)', async () => {
    const billingId = await insertPeriod({ source: 'billing', value: '5' });
    const grantId = await insertPeriod({ source: 'grant', value: '10' });
    try {
      const periods = await listActiveEntitlementPeriods(db, ORG_ID);
      expect(periods).toHaveLength(2);
      const sources = new Set(periods.map((p) => p.source));
      expect(sources).toEqual(new Set(['billing', 'grant']));
    } finally {
      await deleteById(billingId);
      await deleteById(grantId);
    }
  });

  it('future-start and expired periods are excluded', async () => {
    const futureId = await insertPeriod({ startsAt: serviceSql`now() + interval '1 day'` });
    const expiredId = await insertPeriod({ expiresAt: serviceSql`now() - interval '1 hour'` });
    try {
      const periods = await listActiveEntitlementPeriods(db, ORG_ID);
      expect(periods).toHaveLength(0);
    } finally {
      await deleteById(futureId);
      await deleteById(expiredId);
    }
  });
});
