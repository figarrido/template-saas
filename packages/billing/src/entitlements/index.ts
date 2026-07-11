import { and, eq, gt, isNull, lte, or, sql } from 'drizzle-orm';
import type { ServiceClient, EntitlementKey } from '@template/db';
import { schema } from '@template/db';

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
  const activeWindow = (organizationId: string) =>
    and(
      eq(schema.entitlements.organization_id, organizationId),
      lte(schema.entitlements.starts_at, sql`now()`),
      or(isNull(schema.entitlements.expires_at), gt(schema.entitlements.expires_at, sql`now()`)),
    );

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
