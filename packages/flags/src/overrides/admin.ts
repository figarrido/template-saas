import type { OverrideRung, OverrideValue, EvalContext } from '../precedence.js';

export type AdminOverrideLookup = (
  key: string,
  ctx: EvalContext,
) => Promise<OverrideValue | undefined>;

/**
 * Admin-UI rung — reads from `public.flag_overrides`. The lookup is
 * INJECTED so packages/flags never imports packages/db directly. Apps
 * compose it like:
 *
 *   const adminLookup = makeAdminLookup(getServiceClient);
 *   const rungs = [createAdminOverride(adminLookup), envOverride, ...];
 *
 * Precedence: highest (resolveOverride walks rungs in declared order).
 */
export function createAdminOverride(lookup: AdminOverrideLookup): OverrideRung {
  return {
    name: 'admin',
    lookup: async (key, ctx) => lookup(key, ctx),
  };
}
