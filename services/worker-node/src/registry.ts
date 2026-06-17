import { JobRegistry } from '@template/jobs';
import { seedHello } from './jobs/seed-hello.js';
import { emailSend } from './jobs/email-send.js';
import { billingInvoiceFinalized } from './jobs/billing-invoice-finalized.js';

// Single source of truth for which jobs this worker exposes.
// Also consumed by packages/jobs scripts/generate-python-schemas.ts via the
// JOBS_REGISTRY_MODULE env var pointing at this module.

export const registry = new JobRegistry();
registry.register(seedHello);
registry.register(emailSend);
registry.register(billingInvoiceFinalized);

export default registry;
