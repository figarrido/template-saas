import type { OverrideRung, OverrideValue } from '../precedence.js';

/**
 * URL-based override: `?ff_<key>=<value>`. Gated off in production by
 * construction — the caller's middleware decides whether to install this
 * rung. docs/architecture/10-feature-flags.md.
 */
export function createUrlOverride(getQueryParam: (name: string) => string | null | undefined): OverrideRung {
  return {
    name: 'url',
    lookup: async (key) => {
      const raw = getQueryParam(`ff_${key}`);
      if (raw === undefined || raw === null) return undefined;
      try {
        return JSON.parse(raw) as OverrideValue;
      } catch {
        return raw;
      }
    },
  };
}
