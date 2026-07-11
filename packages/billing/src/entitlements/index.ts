import { and, eq, gt, isNull, lte, or, sql } from 'drizzle-orm';
import type { ServiceClient, EntitlementKey } from '@template/db';
import { schema } from '@template/db';

export type ActiveComp = {
  planId: string;
  planName: string;
  keys: EntitlementKey[];
  startsAt: string;
  expiresAt: string | null;
};

export type EntitlementValue = boolean | number | string | Record<string, unknown> | unknown[];

export type EntitlementRow = {
  key: EntitlementKey;
  value: EntitlementValue;
  expiresAt?: string;
};

export type EntitlementsApi = {
  has(organizationId: string, key: EntitlementKey): Promise<boolean>;
  list(organizationId: string): Promise<EntitlementRow[]>;
};

// A single active validity period, as read from the ledger.
type ActivePeriod = {
  key: EntitlementKey;
  value: EntitlementValue;
  source: string;
  expiresAt: string | null;
};

export type ActiveEntitlementPeriod = {
  key: EntitlementKey;
  value: EntitlementValue;
  source: string;
  startsAt: string;
  expiresAt: string | null;
};

/** Operator-facing source label. See docs/architecture/04-billing.md § Entitlements. */
export function entitlementSourceLabel(source: string): 'Billing' | 'Comp' | 'Other' {
  if (source === 'grant') return 'Comp';
  if (source === 'billing') return 'Billing';
  return 'Other';
}

function activeWindow(organizationId: string) {
  return and(
    eq(schema.entitlements.organization_id, organizationId),
    lte(schema.entitlements.starts_at, sql`now()`),
    or(isNull(schema.entitlements.expires_at), gt(schema.entitlements.expires_at, sql`now()`)),
  );
}

export async function listActiveEntitlementPeriods(
  db: ServiceClient,
  organizationId: string,
): Promise<ActiveEntitlementPeriod[]> {
  const rows = await db
    .select({
      key: schema.entitlements.key,
      value: schema.entitlements.value,
      source: schema.entitlements.source,
      starts_at: schema.entitlements.starts_at,
      expires_at: schema.entitlements.expires_at,
    })
    .from(schema.entitlements)
    .where(activeWindow(organizationId))
    .orderBy(schema.entitlements.key, schema.entitlements.starts_at);
  return rows.map((r) => ({
    key: r.key,
    value: r.value as EntitlementValue,
    source: r.source,
    startsAt: r.starts_at,
    expiresAt: r.expires_at,
  }));
}

/**
 * Collapse overlapping active periods to one entry per key. On a value
 * conflict a `grant` (Operator Comp) period wins over a billing period —
 * the Operator override is intentional. Pure, so it is unit-testable
 * without a database. See docs/adr/0007-entitlements-temporal-ledger.md
 * § "Coexistence and precedence".
 */
export function resolveActiveEntitlements(periods: ActivePeriod[]): EntitlementRow[] {
  const byKey = new Map<EntitlementKey, ActivePeriod>();
  for (const p of periods) {
    const current = byKey.get(p.key);
    if (!current) {
      byKey.set(p.key, p);
      continue;
    }
    if (p.source === 'grant' && current.source !== 'grant') byKey.set(p.key, p);
  }
  return [...byKey.values()].map((p) => ({
    key: p.key,
    value: p.value,
    expiresAt: p.expiresAt ?? undefined,
  }));
}

/**
 * Grant a Comp: expand the Plan via plan_entitlements into source='grant'
 * ledger period rows. One row per mapped key, all sharing starts_at=now()
 * (column default) and the chosen expiry. Appends only — never clobbers
 * billing/seed periods. See docs/adr/0007-entitlements-temporal-ledger.md.
 * `expiresAt` is an ISO timestamptz string. Throws if the Plan maps no keys.
 */
export async function grantComp(
  db: ServiceClient,
  input: { organizationId: string; planId: string; grantedBy: string; expiresAt: string },
): Promise<{ keys: EntitlementKey[] }> {
  const mappings = await db
    .select({ key: schema.plan_entitlements.key, value: schema.plan_entitlements.value })
    .from(schema.plan_entitlements)
    .where(eq(schema.plan_entitlements.plan_id, input.planId));
  if (mappings.length === 0) {
    throw new Error('Plan has no entitlements to grant.');
  }
  await db.insert(schema.entitlements).values(
    mappings.map((m) => ({
      organization_id: input.organizationId,
      plan_id: input.planId,
      key: m.key,
      value: m.value,
      source: 'grant' as const,
      granted_by: input.grantedBy,
      expires_at: input.expiresAt,
    })),
  );
  return { keys: mappings.map((m) => m.key) };
}

/**
 * Revoke a Comp early: close every currently-active source='grant' period
 * for (org, plan) by setting expires_at=now(). The sole permitted ledger
 * mutation (ADR 0007). Touches only grant rows for this plan — billing/seed
 * periods for the same key survive.
 */
export async function revokeComp(
  db: ServiceClient,
  input: { organizationId: string; planId: string },
): Promise<{ closed: number }> {
  const closed = await db
    .update(schema.entitlements)
    .set({ expires_at: sql`now()` })
    .where(
      and(
        activeWindow(input.organizationId),
        eq(schema.entitlements.plan_id, input.planId),
        eq(schema.entitlements.source, 'grant'),
      ),
    )
    .returning({ id: schema.entitlements.entitlement_id });
  return { closed: closed.length };
}

/**
 * Active Comps for an org, grouped by Plan (the unit an Operator grants and
 * revokes). One entry per plan; keys are the plan's active grant keys.
 */
export async function listActiveComps(
  db: ServiceClient,
  organizationId: string,
): Promise<ActiveComp[]> {
  const rows = await db
    .select({
      planId: schema.entitlements.plan_id,
      planName: schema.plans.name,
      key: schema.entitlements.key,
      startsAt: schema.entitlements.starts_at,
      expiresAt: schema.entitlements.expires_at,
    })
    .from(schema.entitlements)
    .innerJoin(schema.plans, eq(schema.plans.plan_id, schema.entitlements.plan_id))
    .where(and(activeWindow(organizationId), eq(schema.entitlements.source, 'grant')))
    .orderBy(schema.entitlements.starts_at);

  const byPlan = new Map<string, ActiveComp>();
  for (const r of rows) {
    if (!r.planId) continue;
    const existing = byPlan.get(r.planId);
    if (!existing) {
      byPlan.set(r.planId, {
        planId: r.planId,
        planName: r.planName,
        keys: [r.key],
        startsAt: r.startsAt,
        expiresAt: r.expiresAt,
      });
      continue;
    }
    if (!existing.keys.includes(r.key)) existing.keys.push(r.key);
    if (r.startsAt < existing.startsAt) existing.startsAt = r.startsAt;
    // expiresAt: a period with no expiry dominates; otherwise keep the latest.
    if (existing.expiresAt !== null) {
      if (r.expiresAt === null) {
        existing.expiresAt = null;
      } else if (r.expiresAt > existing.expiresAt) {
        existing.expiresAt = r.expiresAt;
      }
    }
  }
  return [...byPlan.values()];
}

/**
 * Read API for entitlements. Reads ONLY. A feature is held only while an
 * active period covers now() (starts_at <= now AND expires_at null-or-future).
 * Temporal comparison runs in SQL via now() so it uses the DB clock and
 * compares timestamptz correctly.
 *
 * Apps build their own per-request memoization on top (Next.js `cache()` in
 * apps/web, request-scoped maps in workers). Keeping the raw API
 * dependency-free lets every surface wrap it the same way.
 *
 * docs/architecture/04-billing.md § Entitlements: packages/flags receives
 * this API by injection, never by direct import.
 */
export function createEntitlements(db: ServiceClient): EntitlementsApi {
  return {
    async has(organizationId, key) {
      const rows = await db
        .select({ id: schema.entitlements.entitlement_id })
        .from(schema.entitlements)
        .where(and(activeWindow(organizationId), eq(schema.entitlements.key, key)))
        .limit(1);
      return rows.length > 0;
    },

    async list(organizationId) {
      const rows = await db
        .select({
          key: schema.entitlements.key,
          value: schema.entitlements.value,
          source: schema.entitlements.source,
          expires_at: schema.entitlements.expires_at,
        })
        .from(schema.entitlements)
        .where(activeWindow(organizationId));
      return resolveActiveEntitlements(
        rows.map((r) => ({
          key: r.key,
          value: r.value as EntitlementValue,
          source: r.source,
          expiresAt: r.expires_at,
        })),
      );
    },
  };
}
