import type { OverrideRung, OverrideValue } from '../precedence.js';

// FF_OVERRIDE_<key> env var. Values are JSON-parsed; raw strings fall back
// to themselves so `FF_OVERRIDE_NEW_DASHBOARD=true` works without quoting.

export const envOverride: OverrideRung = {
  name: 'env',
  lookup: async (key) => {
    const raw = process.env[`FF_OVERRIDE_${key.toUpperCase()}`];
    if (raw === undefined) return undefined;
    try {
      return JSON.parse(raw) as OverrideValue;
    } catch {
      return raw;
    }
  },
};
