import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { getServiceClient } from '@template/db';
import { createEntitlements } from '../../src/entitlements/index.js';

// Integration suite for the entitlements read API. Runs against the local
// Supabase stack; gated on `migration-validation` in CI alongside the RLS
// suite and auth integration tests (packages/auth/vitest.integration.config.ts).

const DATABASE_URL =
  process.env.WORKER_DATABASE_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54422/postgres';

const serviceSql = postgres(DATABASE_URL, { max: 4, prepare: false });

// Throwaway org — isolated from the seed tenant so tests don't stomp each other.
const ORG_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PLAN_ID = 'aaaabbbb-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const db = getServiceClient({ databaseUrl: DATABASE_URL });
const entitlements = createEntitlements(db);

beforeAll(async () => {
  // Clean up any leftover state from a previous interrupted run.
  await serviceSql`delete from public.entitlements where organization_id = ${ORG_ID}`;
  await serviceSql`delete from public.memberships where organization_id = ${ORG_ID}`;
  await serviceSql`delete from public.organizations where organization_id = ${ORG_ID}`;

  await serviceSql`
    insert into public.organizations (organization_id, name, slug)
    values (${ORG_ID}, 'Entitlement Test Org', 'entitlement-test-org')
    on conflict (organization_id) do nothing
  `;
});

afterAll(async () => {
  await serviceSql`delete from public.entitlements where organization_id = ${ORG_ID}`;
  await serviceSql`delete from public.organizations where organization_id = ${ORG_ID}`;
  await serviceSql.end({ timeout: 5 });
});

async function insertPeriod(opts: {
  source?: string;
  value?: string;
  startsAt?: string;
  expiresAt?: string | null;
}): Promise<string> {
  const source = opts.source ?? 'billing';
  const value = opts.value ?? 'true';
  const startsAt = opts.startsAt ?? "now() - interval '1 day'";
  const expiresAt = opts.expiresAt === undefined ? null : opts.expiresAt;

  const rows = await serviceSql`
    insert into public.entitlements
      (organization_id, key, value, source, starts_at, expires_at)
    values (
      ${ORG_ID},
      'pro',
      ${value}::jsonb,
      ${source},
      ${startsAt}::timestamptz,
      ${expiresAt}::timestamptz
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
    const id = await insertPeriod({ startsAt: "now() - interval '1 day'" });
    try {
      expect(await entitlements.has(ORG_ID, 'pro')).toBe(true);
      const list = await entitlements.list(ORG_ID);
      expect(list.filter((r) => r.key === 'pro')).toHaveLength(1);
    } finally {
      await deleteById(id);
    }
  });

  it('future period (starts_at tomorrow) only → has=false; list omits pro', async () => {
    const id = await insertPeriod({ startsAt: "now() + interval '1 day'" });
    try {
      expect(await entitlements.has(ORG_ID, 'pro')).toBe(false);
      const list = await entitlements.list(ORG_ID);
      expect(list.filter((r) => r.key === 'pro')).toHaveLength(0);
    } finally {
      await deleteById(id);
    }
  });

  it('expired period (expires_at in past) only → has=false; list omits pro', async () => {
    const id = await insertPeriod({ expiresAt: "now() - interval '1 hour'" });
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
