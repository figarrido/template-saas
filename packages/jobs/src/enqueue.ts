import postgres from 'postgres';
import type { ZodTypeAny, z } from 'zod';
import type { JobDefinition } from './defineJob.js';
import { makeEnvelope } from './envelope.js';
import { injectTraceContext } from './tracing.js';

export type EnqueueOptions = {
  delaySeconds?: number;
};

/**
 * Enqueue a job with type-checked payload. Producers call this directly;
 * the worker side picks the matching JobDefinition off the registry.
 */
export async function enqueue<TSchema extends ZodTypeAny>(
  sql: ReturnType<typeof postgres>,
  def: JobDefinition<TSchema>,
  payload: z.infer<TSchema>,
  options: EnqueueOptions = {},
): Promise<number> {
  // Validate at the producer to fail loudly before crossing the queue.
  def.payload.parse(payload);
  const envelope = makeEnvelope({
    name: def.name,
    payload,
    trace: injectTraceContext(),
  });
  const delay = options.delaySeconds ?? 0;
  const rows = (await sql`
    select pgmq.send(${def.queue}, ${JSON.stringify(envelope)}::jsonb, ${delay})::bigint as msg_id
  `) as unknown as Array<{ msg_id: number }>;
  return rows[0]?.msg_id ?? 0;
}
