export {
  configureFlags,
  getClient,
  getBoolean,
  getString,
  type FlagsClientConfig,
} from './client.js';
export { PostHogFlagsProvider, type PostHogProviderConfig } from './providers/posthog.js';
export { envOverride } from './overrides/env.js';
export { createUrlOverride } from './overrides/url.js';
export { createAdminOverride, type AdminOverrideLookup } from './overrides/admin.js';
export {
  resolveOverride,
  type EvalContext,
  type OverrideRung,
  type OverrideValue,
} from './precedence.js';
export { gateOn, type EntitlementsApi, type FlagsApi } from './composition.js';
