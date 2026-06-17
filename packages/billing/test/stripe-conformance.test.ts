import { runConformance } from '../src/conformance/index.js';
import { StripeProvider } from '../src/providers/stripe/index.js';

const provider = new StripeProvider({ secretKey: 'sk_test_fake' });

const baseSub = {
  id: 'sub_123',
  customer: 'cus_123',
  status: 'active' as const,
  current_period_start: 1_700_000_000,
  current_period_end: 1_702_000_000,
  cancel_at_period_end: false,
  items: {
    data: [
      {
        price: {
          id: 'price_123',
          unit_amount: 1000,
          currency: 'usd',
          recurring: { interval: 'month' },
          product: 'prod_123',
        },
      },
    ],
  },
  latest_invoice: 'in_999',
};

const baseInvoice = {
  id: 'in_999',
  customer: 'cus_123',
  status: 'paid' as const,
  currency: 'usd',
  total: 1000,
  amount_paid: 1000,
  status_transitions: {
    finalized_at: 1_700_000_500,
    paid_at: 1_700_000_900,
  },
  hosted_invoice_url: 'https://stripe.test/i/in_999',
};

runConformance({
  provider,
  fixtures: [
    {
      label: 'customer.subscription.created',
      rawEvent: { type: 'customer.subscription.created', data: { object: baseSub } },
      expected: {
        type: 'subscription.created',
        subscription: {
          externalSubscriptionId: 'sub_123',
          externalCustomerId: 'cus_123',
          status: 'active',
          currentPeriodStart: new Date(1_700_000_000 * 1000).toISOString(),
          currentPeriodEnd: new Date(1_702_000_000 * 1000).toISOString(),
          cancelAtPeriodEnd: false,
          prices: [
            {
              externalPriceId: 'price_123',
              unitAmount: 1000,
              currency: 'usd',
              recurringInterval: 'month',
              providerMetadata: { product: 'prod_123' },
            },
          ],
          providerMetadata: { latest_invoice: 'in_999' },
        },
      },
    },
    {
      label: 'invoice.paid',
      rawEvent: { type: 'invoice.paid', data: { object: baseInvoice } },
      expected: {
        type: 'invoice.paid',
        invoice: {
          externalInvoiceId: 'in_999',
          externalCustomerId: 'cus_123',
          status: 'paid',
          currency: 'usd',
          amountTotal: 1000,
          amountPaid: 1000,
          invoicedAt: new Date(1_700_000_500 * 1000).toISOString(),
          paidAt: new Date(1_700_000_900 * 1000).toISOString(),
          providerMetadata: { hosted_invoice_url: 'https://stripe.test/i/in_999' },
        },
      },
    },
    {
      label: 'invoice.payment_failed',
      rawEvent: {
        type: 'invoice.payment_failed',
        data: {
          object: {
            ...baseInvoice,
            id: 'in_555',
            status: 'open',
            amount_paid: 0,
            status_transitions: { finalized_at: 1_700_000_500 },
          },
        },
      },
      expected: {
        type: 'invoice.payment_failed',
        invoice: {
          externalInvoiceId: 'in_555',
          externalCustomerId: 'cus_123',
          status: 'open',
          currency: 'usd',
          amountTotal: 1000,
          amountPaid: 0,
          invoicedAt: new Date(1_700_000_500 * 1000).toISOString(),
          paidAt: undefined,
          providerMetadata: { hosted_invoice_url: 'https://stripe.test/i/in_999' },
        },
      },
    },
    {
      label: 'irrelevant event passes through as null',
      rawEvent: { type: 'charge.succeeded', data: { object: {} } },
      expected: null,
    },
  ],
});
