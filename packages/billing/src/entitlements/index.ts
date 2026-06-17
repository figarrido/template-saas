import { and, eq, gt, isNull, or } from 'drizzle-orm';
import type { ServiceClient } from '@template/db';
import { schema } from '@template/db';

export type EntitlementValue = boolean | number | string | Record<string, unknown> | unknown[];

export type EntitlementRow = {
  key: string;
  value: EntitlementValue;
  expiresAt?: string;
};

export type EntitlementsApi = {
  has(organizationId: string, key: string): Promise<boolean>;
  list(organizationId: string): Promise<EntitlementRow[]>;
};

/**
 * Read API for entitlements. Reads ONLY — webhook handlers do writes.
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
        .where(
          and(
            eq(schema.entitlements.organization_id, organizationId),
            eq(schema.entitlements.key, key),
            or(isNull(schema.entitlements.expires_at), gt(schema.entitlements.expires_at, new Date().toISOString())),
          ),
        )
        .limit(1);
      return rows.length > 0;
    },

    async list(organizationId) {
      const rows = await db
        .select({
          key: schema.entitlements.key,
          value: schema.entitlements.value,
          expires_at: schema.entitlements.expires_at,
        })
        .from(schema.entitlements)
        .where(
          and(
            eq(schema.entitlements.organization_id, organizationId),
            or(isNull(schema.entitlements.expires_at), gt(schema.entitlements.expires_at, new Date().toISOString())),
          ),
        );
      return rows.map((r) => ({
        key: r.key,
        value: r.value as EntitlementValue,
        expiresAt: r.expires_at ?? undefined,
      }));
    },
  };
}
