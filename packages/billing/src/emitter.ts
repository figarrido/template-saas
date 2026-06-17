import type { TaxDocument } from './domain.js';

export type EmitInput = {
  invoiceExternalId: string;
  organizationId: string;
  documentKind: string;
  recipient: {
    name: string;
    taxId?: string;
    email?: string;
  };
  lineItems: Array<{
    description: string;
    quantity: number;
    unitAmount: number;
    currency: string;
  }>;
  metadata?: Record<string, unknown>;
};

/**
 * Tax-document emitter interface. The template ships the interface only —
 * no concrete implementation. Derived projects implement against
 * jurisdiction-specific services (Openfactura, Bsale, Haulmer, etc.).
 *
 * docs/architecture/04-billing.md: "Only providers/stripe ships. No
 * emitter adapter ships."
 *
 * Apps subscribe an EmitterProvider to the `billing.invoice.paid` event
 * and emit a TaxDocument when it lands. The void/getStatus calls let the
 * admin app remediate or display state.
 */
export interface EmitterProvider {
  readonly name: string;

  emit(input: EmitInput): Promise<TaxDocument>;
  void(externalDocumentId: string, reason: string): Promise<TaxDocument>;
  getStatus(externalDocumentId: string): Promise<TaxDocument['status']>;
}
