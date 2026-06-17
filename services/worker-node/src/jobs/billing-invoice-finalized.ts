import { z } from 'zod';
import { defineJob } from '@template/jobs';
import { createLogger } from '@template/observability';

const log = createLogger({ service: 'worker-node' });

// Reference handler. Real implementations would call into the
// EmitterProvider seam — packages/billing exports the interface only, so
// derived projects can ship a concrete adapter here.
export const billingInvoiceFinalized = defineJob({
  name: 'billing.invoice.finalized',
  queue: 'billing',
  payload: z.object({
    invoiceExternalId: z.string(),
    organizationId: z.string().uuid(),
  }),
  handler: async ({ invoiceExternalId, organizationId }) => {
    log.info({ invoiceExternalId, organizationId }, 'billing.invoice.finalized — emitter seam');
  },
});
