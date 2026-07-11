export type {
  BillingEvent,
  Customer,
  Invoice,
  Money,
  PaymentMethod,
  Plan,
  Price,
  Subscription,
  TaxDocument,
  UsageEvent,
} from './domain.js';
export type {
  BillingProvider,
  CheckoutSession,
  CheckoutSessionInput,
  CustomerLookup,
  CustomerPortalInput,
  WebhookVerification,
} from './provider.js';
export type { EmitterProvider, EmitInput } from './emitter.js';
export { BillingRegistry, type EmitterRoute, type ProviderRoute, type RouteContext } from './registry.js';
export { StripeProvider, type StripeProviderConfig } from './providers/stripe/index.js';
export {
  createEntitlements,
  resolveActiveEntitlements,
  listActiveEntitlementPeriods,
  entitlementSourceLabel,
  grantComp,
  revokeComp,
  listActiveComps,
  type EntitlementsApi,
  type EntitlementRow,
  type EntitlementValue,
  type ActiveEntitlementPeriod,
  type ActiveComp,
} from './entitlements/index.js';
