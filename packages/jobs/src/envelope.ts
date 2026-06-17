import { z } from 'zod';
import type { TraceCarrier } from './tracing.js';

// Envelope every enqueued job is wrapped in. Pgmq sees only this JSON.
// Consumers unwrap, validate the payload against the registered Zod schema,
// re-enter the trace, and call the handler.

export const ENVELOPE_SCHEMA = z.object({
  name: z.string(),
  payload: z.unknown(),
  attempt: z.number().int().nonnegative().default(0),
  enqueuedAt: z.string(),
  traceparent: z.record(z.string()).optional(),
});

export type JobEnvelope = z.infer<typeof ENVELOPE_SCHEMA>;

export function makeEnvelope<T>(input: {
  name: string;
  payload: T;
  attempt?: number;
  trace?: TraceCarrier;
}): JobEnvelope {
  return {
    name: input.name,
    payload: input.payload as unknown,
    attempt: input.attempt ?? 0,
    enqueuedAt: new Date().toISOString(),
    traceparent: input.trace,
  };
}
