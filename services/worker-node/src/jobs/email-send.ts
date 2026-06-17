import { z } from 'zod';
import { defineJob } from '@template/jobs';
import { selectEmailProvider } from '@template/email';
import { createLogger } from '@template/observability';

const log = createLogger({ service: 'worker-node' });

export const emailSend = defineJob({
  name: 'email.send',
  queue: 'emails',
  payload: z.object({
    to: z.string().email(),
    from: z.string().email(),
    subject: z.string(),
    html: z.string().optional(),
    text: z.string().optional(),
  }),
  handler: async (payload) => {
    const provider = selectEmailProvider();
    const result = await provider.send(payload);
    log.info({ provider: result.provider, id: result.id }, 'email sent');
  },
});
