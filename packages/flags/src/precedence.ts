// Override precedence per docs/architecture/10-feature-flags.md:
//   admin UI > env var > URL param > provider value > default.
//
// All rungs return either a typed value or `undefined` (not present). The
// composition layer walks from highest precedence to lowest and stops at
// the first defined value.

export type OverrideValue = boolean | number | string | Record<string, unknown>;

export type OverrideRung<TKey extends string = string> = {
  name: string;
  lookup: (key: TKey, ctx: EvalContext) => Promise<OverrideValue | undefined>;
};

export type EvalContext = {
  userId?: string;
  organizationId?: string;
  /** Hostname / surface — used by some overrides to scope. */
  surface?: 'web' | 'admin' | 'worker';
};

export async function resolveOverride<TKey extends string>(
  rungs: ReadonlyArray<OverrideRung<TKey>>,
  key: TKey,
  ctx: EvalContext,
): Promise<{ value: OverrideValue; source: string } | undefined> {
  for (const rung of rungs) {
    const v = await rung.lookup(key, ctx);
    if (v !== undefined) return { value: v, source: rung.name };
  }
  return undefined;
}
