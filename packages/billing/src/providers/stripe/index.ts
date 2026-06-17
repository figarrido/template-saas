import Stripe from 'stripe';
import type {
  BillingProvider,
  CheckoutSession,
  CheckoutSessionInput,
  CustomerPortalInput,
  WebhookVerification,
} from '../../provider.js';
import type { BillingEvent, Invoice, PaymentMethod, Subscription, UsageEvent } from '../../domain.js';

export type StripeProviderConfig = {
  secretKey: string;
  /** Stripe API version to pin against. Defaults to a known-good value. */
  apiVersion?: string;
};

// Pinned account API version. Bump deliberately — Stripe occasionally
// reshapes Subscription/Invoice in ways that ripple through normalize().
const DEFAULT_API_VERSION = '2024-06-20';

export class StripeProvider implements BillingProvider {
  readonly name = 'stripe';
  private readonly client: Stripe;

  constructor(config: StripeProviderConfig) {
    // Cast to `never`: Stripe's `apiVersion` field is typed as a literal
    // union of the latest API version only, but the SDK accepts older pinned
    // versions at runtime. Pinning deliberately — see DEFAULT_API_VERSION.
    this.client = new Stripe(config.secretKey, {
      apiVersion: (config.apiVersion ?? DEFAULT_API_VERSION) as never,
    });
  }

  async createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSession> {
    const session = await this.client.checkout.sessions.create({
      mode: 'subscription',
      customer_email: input.customerEmail,
      line_items: input.externalPriceIds.map((priceId) => ({ price: priceId, quantity: 1 })),
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      metadata: { organization_id: input.organizationId, ...(input.metadata ?? {}) },
    });
    return { externalSessionId: session.id, url: session.url ?? '' };
  }

  async createCustomerPortalSession(input: CustomerPortalInput): Promise<{ url: string }> {
    const session = await this.client.billingPortal.sessions.create({
      customer: input.externalCustomerId,
      return_url: input.returnUrl,
    });
    return { url: session.url };
  }

  async getSubscription(externalSubscriptionId: string): Promise<Subscription | null> {
    try {
      const sub = await this.client.subscriptions.retrieve(externalSubscriptionId);
      return toSubscription(sub);
    } catch (err) {
      if (err instanceof Stripe.errors.StripeError && err.code === 'resource_missing') return null;
      throw err;
    }
  }

  async cancelSubscription(
    externalSubscriptionId: string,
    atPeriodEnd: boolean,
  ): Promise<Subscription> {
    const sub = atPeriodEnd
      ? await this.client.subscriptions.update(externalSubscriptionId, {
          cancel_at_period_end: true,
        })
      : await this.client.subscriptions.cancel(externalSubscriptionId);
    return toSubscription(sub);
  }

  async reportUsage(event: UsageEvent): Promise<void> {
    // Stripe migrated usage to meter events. Derived projects with metered
    // pricing supply the meter event payload via UsageEvent.metadata.
    await this.client.billing.meterEvents.create(
      {
        event_name: (event.metadata?.event_name as string) ?? 'usage',
        payload: {
          stripe_customer_id: event.externalSubscriptionItemId,
          value: String(event.quantity),
        },
        timestamp: event.timestamp ? Math.floor(new Date(event.timestamp).getTime() / 1000) : undefined,
        identifier: event.idempotencyKey,
      },
      { idempotencyKey: event.idempotencyKey },
    );
  }

  async listPaymentMethods(externalCustomerId: string): Promise<PaymentMethod[]> {
    const list = await this.client.paymentMethods.list({
      customer: externalCustomerId,
      type: 'card',
    });
    return list.data.map((pm) => ({
      externalPaymentMethodId: pm.id,
      kind: 'card',
      brand: pm.card?.brand,
      last4: pm.card?.last4,
    }));
  }

  async verifyWebhook(input: WebhookVerification): Promise<Stripe.Event> {
    return this.client.webhooks.constructEventAsync(input.rawBody, input.signature, input.secret);
  }

  normalizeWebhookEvent(rawEvent: unknown): BillingEvent | null {
    const event = rawEvent as Stripe.Event;
    switch (event.type) {
      case 'customer.subscription.created':
        return {
          type: 'subscription.created',
          subscription: toSubscription(event.data.object as Stripe.Subscription),
        };
      case 'customer.subscription.updated':
        return {
          type: 'subscription.updated',
          subscription: toSubscription(event.data.object as Stripe.Subscription),
        };
      case 'customer.subscription.deleted':
        return {
          type: 'subscription.canceled',
          subscription: toSubscription(event.data.object as Stripe.Subscription),
        };
      case 'invoice.finalized':
        return {
          type: 'invoice.finalized',
          invoice: toInvoice(event.data.object as Stripe.Invoice),
        };
      case 'invoice.paid':
        return { type: 'invoice.paid', invoice: toInvoice(event.data.object as Stripe.Invoice) };
      case 'invoice.payment_failed':
        return {
          type: 'invoice.payment_failed',
          invoice: toInvoice(event.data.object as Stripe.Invoice),
        };
      default:
        return null;
    }
  }
}

// Period dates moved from Subscription to its items in newer API versions.
// Accept either shape; raw event fixtures cover both runtimes.
function toSubscription(sub: Stripe.Subscription): Subscription {
  const firstItem = sub.items.data[0];
  const subAny = sub as unknown as Record<string, unknown>;
  const itemAny = firstItem as unknown as Record<string, unknown>;
  const periodStart =
    (subAny['current_period_start'] as number | undefined) ??
    (itemAny?.['current_period_start'] as number | undefined) ??
    0;
  const periodEnd =
    (subAny['current_period_end'] as number | undefined) ??
    (itemAny?.['current_period_end'] as number | undefined) ??
    0;
  return {
    externalSubscriptionId: sub.id,
    externalCustomerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    status: sub.status as Subscription['status'],
    currentPeriodStart: new Date(periodStart * 1000).toISOString(),
    currentPeriodEnd: new Date(periodEnd * 1000).toISOString(),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    prices: sub.items.data.map((item) => ({
      externalPriceId: item.price.id,
      unitAmount: item.price.unit_amount ?? 0,
      currency: item.price.currency,
      recurringInterval: item.price.recurring?.interval as Subscription['prices'][number]['recurringInterval'],
      providerMetadata: { product: item.price.product },
    })),
    providerMetadata: { latest_invoice: subAny['latest_invoice'] },
  };
}

function toInvoice(invoice: Stripe.Invoice): Invoice {
  return {
    externalInvoiceId: invoice.id ?? '',
    externalCustomerId:
      typeof invoice.customer === 'string' ? invoice.customer : (invoice.customer?.id ?? ''),
    status: (invoice.status ?? 'draft') as Invoice['status'],
    currency: invoice.currency,
    amountTotal: invoice.total,
    amountPaid: invoice.amount_paid,
    invoicedAt: invoice.status_transitions?.finalized_at
      ? new Date(invoice.status_transitions.finalized_at * 1000).toISOString()
      : undefined,
    paidAt: invoice.status_transitions?.paid_at
      ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
      : undefined,
    providerMetadata: { hosted_invoice_url: invoice.hosted_invoice_url },
  };
}
