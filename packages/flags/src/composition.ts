import type { EvalContext } from './precedence.js';

// Entitlements API shape we expect — INJECTED, never imported.
// docs/architecture/10-feature-flags.md: packages/flags MUST NOT import
// packages/billing. The shared eslint preset bans the import; this
// injection point is the structural reason for the ban.
export type EntitlementsApi = {
  has(organizationId: string, key: string): Promise<boolean>;
};

export type FlagsApi = {
  getBoolean(key: string, defaultValue: boolean, ctx: EvalContext): Promise<boolean>;
};

/**
 * Compose entitlements (paid access) with flags (rollout/kill switch).
 * Both must pass for a gated feature to render — per the doc's
 * `if (entitlements.has('pro') && flags.isOn('new_dashboard'))` example.
 */
export async function gateOn({
  entitlements,
  flags,
  entitlementKey,
  flagKey,
  ctx,
}: {
  entitlements: EntitlementsApi;
  flags: FlagsApi;
  entitlementKey: string;
  flagKey: string;
  ctx: EvalContext;
}): Promise<boolean> {
  if (!ctx.organizationId) return false;
  const [hasEntitlement, flagOn] = await Promise.all([
    entitlements.has(ctx.organizationId, entitlementKey),
    flags.getBoolean(flagKey, false, ctx),
  ]);
  return hasEntitlement && flagOn;
}
