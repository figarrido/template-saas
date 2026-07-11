import { and, asc, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import type { ServiceClient } from '@template/db';
import { schema } from '@template/db';
import {
  listActiveEntitlementPeriods,
  entitlementSourceLabel,
  type ActiveEntitlementPeriod,
} from '@template/billing/entitlements';

export const ORG_PAGE_SIZE = 25;

export type OrganizationListRow = {
  organizationId: string;
  name: string;
  slug: string;
  createdAt: string;
  memberCount: number;
};

export type OrganizationListResult = {
  rows: OrganizationListRow[];
  total: number;
  page: number;
  pageSize: number;
};

export type OrganizationMember = {
  userId: string;
  displayName: string | null;
  role: 'owner' | 'manager' | 'member';
};

export type OrganizationEntitlement = ActiveEntitlementPeriod & {
  sourceLabel: 'Billing' | 'Comp' | 'Other';
};

export type OrganizationDetail = {
  organizationId: string;
  name: string;
  slug: string;
  createdAt: string;
  members: OrganizationMember[];
  entitlements: OrganizationEntitlement[];
};

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export async function listOrganizations(
  db: ServiceClient,
  params: { search?: string; page?: number },
): Promise<OrganizationListResult> {
  const pageSize = ORG_PAGE_SIZE;
  const page = Math.max(1, Math.trunc(params.page ?? 1));
  const offset = (page - 1) * pageSize;

  const search = params.search?.trim();
  let where: SQL | undefined;
  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    where = or(ilike(schema.organizations.name, pattern), ilike(schema.organizations.slug, pattern));
  }

  const rows = await db
    .select({
      organizationId: schema.organizations.organization_id,
      name: schema.organizations.name,
      slug: schema.organizations.slug,
      createdAt: schema.organizations.created_at,
      memberCount: count(schema.memberships.membership_id),
    })
    .from(schema.organizations)
    .leftJoin(
      schema.memberships,
      eq(schema.memberships.organization_id, schema.organizations.organization_id),
    )
    .where(where)
    .groupBy(schema.organizations.organization_id)
    .orderBy(desc(schema.organizations.created_at))
    .limit(pageSize)
    .offset(offset);

  const totalRows = await db
    .select({ total: count() })
    .from(schema.organizations)
    .where(where);
  const total = totalRows[0]?.total ?? 0;

  return { rows, total, page, pageSize };
}

export async function getOrganizationDetail(
  db: ServiceClient,
  organizationId: string,
): Promise<OrganizationDetail | null> {
  const orgRows = await db
    .select({
      organizationId: schema.organizations.organization_id,
      name: schema.organizations.name,
      slug: schema.organizations.slug,
      createdAt: schema.organizations.created_at,
    })
    .from(schema.organizations)
    .where(eq(schema.organizations.organization_id, organizationId))
    .limit(1);
  const org = orgRows[0];
  if (!org) return null;

  const members = await db
    .select({
      userId: schema.memberships.user_id,
      displayName: schema.profiles.display_name,
      role: schema.memberships.role,
    })
    .from(schema.memberships)
    .leftJoin(schema.profiles, eq(schema.profiles.user_id, schema.memberships.user_id))
    .where(eq(schema.memberships.organization_id, organizationId))
    .orderBy(asc(schema.memberships.role), asc(schema.profiles.display_name));

  const periods = await listActiveEntitlementPeriods(db, organizationId);
  const entitlements = periods.map((p) => ({ ...p, sourceLabel: entitlementSourceLabel(p.source) }));

  return { ...org, members, entitlements };
}
