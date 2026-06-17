import { context, propagation, trace, type Span } from '@opentelemetry/api';

export type TraceCarrier = Record<string, string>;

/**
 * Capture the active OTel context into a plain object that rides along in
 * the pgmq job payload envelope. Workers reverse this with `withTraceContext`.
 *
 * Why payload envelope: pgmq sees only the JSON message, so we cannot rely
 * on HTTP-layer propagation. The carrier shape is W3C `traceparent` +
 * `tracestate` — same wire format as HTTP, just transported via Postgres.
 */
export function injectTraceContext(): TraceCarrier {
  const carrier: TraceCarrier = {};
  propagation.inject(context.active(), carrier);
  return carrier;
}

/**
 * Re-enter the upstream trace on the consumer side. The handler runs as a
 * child span of whatever produced the job.
 */
export async function withTraceContext<T>(
  carrier: TraceCarrier | undefined,
  spanName: string,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const tracer = trace.getTracer('@template/jobs');
  const parent = carrier ? propagation.extract(context.active(), carrier) : context.active();
  return context.with(parent, async () => {
    return tracer.startActiveSpan(spanName, async (span) => {
      try {
        return await fn(span);
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({ code: 2, message: (err as Error).message });
        throw err;
      } finally {
        span.end();
      }
    });
  });
}
