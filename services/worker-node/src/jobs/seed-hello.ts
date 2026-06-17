import { z } from 'zod';
import { defineJob } from '@template/jobs';
import { createLogger } from '@template/observability';

const log = createLogger({ service: 'worker-node' });

// Matches the message supabase/seed.sql pushes onto the `default` queue.
// Lets engineers see worker plumbing produce a log line right after `pnpm dev`.
export const seedHello = defineJob({
  name: 'seed.hello',
  queue: 'default',
  payload: z.object({ message: z.string() }),
  handler: async ({ message }, ctx) => {
    log.info({ msgId: ctx.msgId, attempt: ctx.attempt }, `seed.hello: ${message}`);
  },
});
