import type {
  BillingEvent,
  Customer,
  PaymentMethod,
  Subscription,
  UsageEvent,
} from './domain.js';

export type CheckoutSessionInput = {
  organizationId: string;
  customerEmail: string;
  externalPriceIds: string[];
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
};

export type CheckoutSession = {
  externalSessionId: string;
  url: string;
};

export type CustomerPortalInput = {
  externalCustomerId: string;
  returnUrl: string;
};

export type WebhookVerification = {
  rawBody: string;
  signature: string;
  /** Provider-specific webhook secret. */
  secret: string;
};

/**
 * Every charging provider derives from this interface. docs/architecture/04-billing.md
 * splits charging (this) from tax-document emission (EmitterProvider).
 */
export interface BillingProvider {
  readonly name: string;

  createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSession>;
  createCustomerPortalSession(input: CustomerPortalInput): Promise<{ url: string }>;
  getSubscription(externalSubscriptionId: string): Promise<Subscription | null>;
  cancelSubscription(externalSubscriptionId: string, atPeriodEnd: boolean): Promise<Subscription>;
  reportUsage(event: UsageEvent): Promise<void>;
  listPaymentMethods(externalCustomerId: string): Promise<PaymentMethod[]>;

  /** Returns the raw provider event on success; throws on signature mismatch. */
  verifyWebhook(input: WebhookVerification): Promise<unknown>;
  /** Maps a verified provider event to the template's BillingEvent union. */
  normalizeWebhookEvent(rawEvent: unknown): BillingEvent | null;
}

export type CustomerLookup = (organizationId: string) => Promise<Customer | null>;
