import { afterAll, describe, expect, it } from 'vitest';
import { SEED, asUser, serviceSql } from './setup.js';

// RLS + RPC tests for public.create_organization.
// docs/architecture/03-auth.md § Organization creation & slug derivation.

afterAll(async () => {
  // Defensive cleanup: delete any org created during these tests by test-name
  // prefix. Memberships cascade on org delete.
  await serviceSql`
    delete from public.organizations where name like 'RPC Test%'
  `;
  await serviceSql.end({ timeout: 5 });
});

describe('create_organization RPC', () => {
  it('atomically creates org and owner membership', async () => {
    const result = await asUser(SEED.regularUserId, async (tx) => {
      const rows = await tx<Array<{ organization_id: string; slug: string }>>`
        select organization_id, slug from public.create_organization('RPC Test Alpha')
      `;
      const org = rows[0];
      if (!org) throw new Error('No org returned');

      // In the same transaction: confirm the org and membership exist.
      const orgRows = await tx<Array<{ organization_id: string }>>`
        select organization_id from public.organizations
        where organization_id = ${org.organization_id}
      `;
      const memberRows = await tx<Array<{ role: string }>>`
        select role from public.memberships
        where user_id = ${SEED.regularUserId}
          and organization_id = ${org.organization_id}
      `;
      return { org, orgRows, memberRows };
    });

    expect(result.orgRows).toHaveLength(1);
    expect(result.memberRows).toHaveLength(1);
    expect(result.memberRows[0]?.role).toBe('owner');
  });

  it('suffixes slug on collision', async () => {
    const [slug1, slug2] = await asUser(SEED.regularUserId, async (tx) => {
      const r1 = await tx<Array<{ slug: string }>>`
        select slug from public.create_organization('RPC Test Collide')
      `;
      const r2 = await tx<Array<{ slug: string }>>`
        select slug from public.create_organization('RPC Test Collide')
      `;
      return [r1[0]?.slug, r2[0]?.slug];
    });

    expect(slug1).toBeDefined();
    expect(slug2).toBeDefined();
    expect(slug1).not.toBe(slug2);
    expect(slug2).toMatch(/^rpc-test-collide-\d+$/);
  });

  it('remaps reserved word slug', async () => {
    const slug = await asUser(SEED.regularUserId, async (tx) => {
      const rows = await tx<Array<{ slug: string }>>`
        select slug from public.create_organization('Account')
      `;
      return rows[0]?.slug;
    });

    expect(slug).toBeDefined();
    expect(slug).not.toBe('account');
    expect(slug).toMatch(/^account-\d+$/);

    // cleanup
    await serviceSql`delete from public.organizations where name = 'Account'`;
  });

  it('rejects name shorter than 2 characters', async () => {
    await expect(
      asUser(SEED.regularUserId, (tx) =>
        tx`select public.create_organization('a')`,
      ),
    ).rejects.toThrow();
  });

  it('rejects name longer than 50 characters', async () => {
    await expect(
      asUser(SEED.regularUserId, (tx) =>
        tx`select public.create_organization(${'a'.repeat(51)})`,
      ),
    ).rejects.toThrow();
  });

  it('anon cannot execute the RPC', async () => {
    await expect(
      serviceSql.begin(async (tx) => {
        await tx`set local role anon`;
        await tx`select public.create_organization('X')`;
      }),
    ).rejects.toThrow();
  });

  it('anon cannot directly insert into organizations', async () => {
    // Authenticated direct insert is already covered in cross-tenant.test.ts.
    await expect(
      serviceSql.begin(async (tx) => {
        await tx`set local role anon`;
        await tx`insert into public.organizations (name, slug) values ('x', 'x-anon-test')`;
      }),
    ).rejects.toThrow();
  });
});
