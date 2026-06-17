import type { ZodTypeAny, z } from 'zod';

// Default retry curve per docs/architecture/05-jobs.md: 30s / 2m / 10m / 1h / 6h.
// Attempt N waits DEFAULT_BACKOFF[N - 1] before re-running. After
// DEFAULT_MAX_ATTEMPTS the message is archived to the queue's DLQ.
export const DEFAULT_BACKOFF_SECONDS = [30, 120, 600, 3600, 21_600] as const;
export const DEFAULT_MAX_ATTEMPTS = 5;

export type RetryPolicy = {
  scheduleSeconds: ReadonlyArray<number>;
  maxAttempts: number;
};

export const DEFAULT_RETRY: RetryPolicy = {
  scheduleSeconds: DEFAULT_BACKOFF_SECONDS,
  maxAttempts: DEFAULT_MAX_ATTEMPTS,
};

export type JobContext = {
  jobName: string;
  attempt: number;
  enqueuedAt: string;
  /** Resolved on consumer side from the envelope (see tracing.ts). */
  traceparent?: string;
  msgId: number;
};

export type JobHandler<TPayload> = (
  payload: TPayload,
  ctx: JobContext,
) => Promise<void> | void;

export type JobDefinition<TSchema extends ZodTypeAny = ZodTypeAny> = {
  name: string;
  queue: string;
  payload: TSchema;
  handler: JobHandler<z.infer<TSchema>>;
  retry?: RetryPolicy;
};

/**
 * Declare a job. Payload is validated against the Zod schema both at
 * enqueue time (the typed enqueue helper) and at handler entry (defense
 * in depth — Python schemas are generated FROM this TS source).
 */
export function defineJob<TSchema extends ZodTypeAny>(
  def: JobDefinition<TSchema>,
): JobDefinition<TSchema> {
  return def;
}
