// Provider-agnostic domain types. Vendor specifics ride along in
// `providerMetadata` so the core stays small. docs/architecture/04-billing.md.

export type Money = {
  amount: number; // integer minor units
  currency: string; // ISO 4217
};

export type Customer = {
  organizationId: string;
  externalCustomerId: string;
  provider: string;
  email?: string;
  providerMetadata?: Record<string, unknown>;
};

export type Price = {
  externalPriceId: string;
  unitAmount: number;
  currency: string;
  recurringInterval?: 'day' | 'week' | 'month' | 'year';
  providerMetadata?: Record<string, unknown>;
};

export type Plan = {
  planId: string; // internal plan slug
  externalPriceIds: string[]; // mapped FROM the internal plan
  name: string;
};

export type Subscription = {
  externalSubscriptionId: string;
  externalCustomerId: string;
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'paused' | 'incomplete';
  currentPeriodStart: string; // ISO
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  prices: Price[];
  providerMetadata?: Record<string, unknown>;
};

export type Invoice = {
  externalInvoiceId: string;
  externalCustomerId: string;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  currency: string;
  amountTotal: number;
  amountPaid: number;
  invoicedAt?: string;
  paidAt?: string;
  providerMetadata?: Record<string, unknown>;
};

// Internal Invoice ≠ legal TaxDocument. EmitterProvider creates the latter
// from the former when billing.invoice.paid lands.
export type TaxDocument = {
  taxDocumentId: string;
  invoiceExternalId: string;
  emitter: string;
  documentKind: string;
  status: 'pending' | 'emitted' | 'voided' | 'failed';
  externalDocumentId?: string;
  emittedAt?: string;
  metadata?: Record<string, unknown>;
};

export type PaymentMethod = {
  externalPaymentMethodId: string;
  kind: 'card' | 'bank' | 'wallet' | 'other';
  last4?: string;
  brand?: string;
};

export type UsageEvent = {
  externalSubscriptionItemId: string;
  quantity: number;
  /** Idempotency key — providers will reject double-submits with the same id. */
  idempotencyKey: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
};

// Discriminated lifecycle event from the provider. Apps subscribe to this
// single union rather than learning each provider's event taxonomy.
export type BillingEvent =
  | { type: 'customer.created'; customer: Customer }
  | { type: 'subscription.created'; subscription: Subscription }
  | { type: 'subscription.updated'; subscription: Subscription }
  | { type: 'subscription.canceled'; subscription: Subscription }
  | { type: 'invoice.finalized'; invoice: Invoice }
  | { type: 'invoice.paid'; invoice: Invoice }
  | { type: 'invoice.payment_failed'; invoice: Invoice };
