import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { SEED, asUser, serviceSql } from './setup.js';

// docs/architecture/02-data.md § Testing: "spins up local Supabase, seeds
// multi-tenant data, asserts cross-tenant queries fail. Highest-leverage test
// the template ships."
//
// These tests are the floor — every new tenant-scoped table should grow a
// matching positive + negative case here.

const OUTSIDER_USER_ID = '99999999-9999-9999-9999-999999999999';
const OUTSIDER_ORG_ID = '88888888-8888-8888-8888-888888888888';

beforeAll(async () => {
  // Create an outsider user + their own org with no overlap with the seed
  // tenant. The transaction-scoped tests below cannot create users (RLS aside,
  // auth.users insert needs a long row), so we set it up once outside.
  await serviceSql`
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', ${OUTSIDER_USER_ID},
      'authenticated', 'authenticated', 'outsider@template.test',
      crypt('password', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Outsider"}'::jsonb,
      now(), now(), '', '', '', ''
    ) on conflict (id) do nothing
  `;
  await serviceSql`
    insert into public.organizations (organization_id, name, slug)
    values (${OUTSIDER_ORG_ID}, 'Outsider Org', 'outsider-org')
    on conflict (organization_id) do nothing
  `;
  await serviceSql`
    insert into public.memberships (user_id, organization_id, role)
    values (${OUTSIDER_USER_ID}, ${OUTSIDER_ORG_ID}, 'owner')
    on conflict (user_id, organization_id) do nothing
  `;
  await serviceSql`
    insert into public.entitlements (organization_id, key, value, source)
    values (${OUTSIDER_ORG_ID}, 'pro', 'true'::jsonb, 'seed')
    on conflict (organization_id, key) do nothing
  `;
});

afterAll(async () => {
  await serviceSql`delete from public.memberships where user_id = ${OUTSIDER_USER_ID}`;
  await serviceSql`delete from public.entitlements where organization_id = ${OUTSIDER_ORG_ID}`;
  await serviceSql`delete from public.organizations where organization_id = ${OUTSIDER_ORG_ID}`;
  await serviceSql`delete from auth.users where id = ${OUTSIDER_USER_ID}`;
  await serviceSql.end({ timeout: 5 });
});

describe('RLS — organizations', () => {
  it('seeded user sees only their own organization', async () => {
    const rows = await asUser(SEED.regularUserId, (tx) =>
      tx`select organization_id from public.organizations`.then((r) => r as unknown as Array<{ organization_id: string }>),
    );
    expect(rows.map((r) => r.organization_id)).toEqual([SEED.orgId]);
  });

  it('outsider sees only their own organization', async () => {
    const rows = await asUser(OUTSIDER_USER_ID, (tx) =>
      tx`select organization_id from public.organizations`.then((r) => r as unknown as Array<{ organization_id: string }>),
    );
    expect(rows.map((r) => r.organization_id)).toEqual([OUTSIDER_ORG_ID]);
  });

  it('blocks direct INSERT from authenticated client', async () => {
    await expect(
      asUser(SEED.regularUserId, (tx) =>
        tx`insert into public.organizations (name, slug) values ('Sneaky', ${'sneaky-' + randomUUID()})`,
      ),
    ).rejects.toThrow();
  });
});

describe('RLS — memberships', () => {
  it('member sees memberships of their org only', async () => {
    const rows = await asUser(SEED.regularUserId, (tx) =>
      tx`select organization_id from public.memberships`.then((r) => r as unknown as Array<{ organization_id: string }>),
    );
    expect(new Set(rows.map((r) => r.organization_id))).toEqual(new Set([SEED.orgId]));
  });

  it('non-admin cannot modify membership roles', async () => {
    await expect(
      asUser(SEED.regularUserId, (tx) =>
        tx`update public.memberships set role = 'owner' where user_id = ${SEED.regularUserId}`,
      ),
    ).resolves.toBeTruthy(); // returns 0 rows affected, not a thrown error
    const rows = (await asUser(SEED.regularUserId, (tx) =>
      tx`select role from public.memberships where user_id = ${SEED.regularUserId}`,
    )) as unknown as Array<{ role: string }>;
    expect(rows[0]?.role).toBe('member');
  });
});

describe('RLS — entitlements', () => {
  it('member sees only their org entitlements', async () => {
    const rows = await asUser(SEED.regularUserId, (tx) =>
      tx`select organization_id from public.entitlements`.then((r) => r as unknown as Array<{ organization_id: string }>),
    );
    expect(rows.map((r) => r.organization_id)).toEqual([SEED.orgId]);
  });

  it('outsider does not see other tenants entitlements', async () => {
    const rows = await asUser(OUTSIDER_USER_ID, (tx) =>
      tx`select organization_id from public.entitlements`.then((r) => r as unknown as Array<{ organization_id: string }>),
    );
    expect(rows.map((r) => r.organization_id)).toEqual([OUTSIDER_ORG_ID]);
  });
});

describe('RLS — admin tables are invisible to client', () => {
  it('admin_users is empty to a regular user', async () => {
    const rows = await asUser(SEED.regularUserId, (tx) =>
      tx`select user_id from public.admin_users`,
    );
    expect(rows.length).toBe(0);
  });

  it('admin_users is empty even to a seeded admin via client connection', async () => {
    // Per docs/architecture/03-auth.md, admin enforcement is application-layer
    // (apps/admin uses service role); admin_users itself is service-role only.
    const rows = await asUser(SEED.adminUserId, (tx) =>
      tx`select user_id from public.admin_users`,
    );
    expect(rows.length).toBe(0);
  });

  it('admin_audit_log is empty via client connection', async () => {
    const rows = await asUser(SEED.regularUserId, (tx) =>
      tx`select admin_audit_log_id from public.admin_audit_log`,
    );
    expect(rows.length).toBe(0);
  });
});
