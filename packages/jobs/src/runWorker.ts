import postgres from 'postgres';
import { createServer, type Server } from 'node:http';
import type { JobRegistry } from './registry.js';
import { ENVELOPE_SCHEMA, type JobEnvelope } from './envelope.js';
import { DEFAULT_RETRY, type RetryPolicy } from './defineJob.js';
import { withTraceContext } from './tracing.js';
import { createLogger, withContext, type Logger } from '@template/observability';

export type RunWorkerOptions = {
  registry: JobRegistry;
  databaseUrl: string;
  queues: string[];
  service: string;
  /** Per-attempt visibility timeout — the no-job-loss safety net. */
  visibilityTimeoutSeconds?: number;
  /** Default retry policy for jobs that don't declare their own. */
  retry?: RetryPolicy;
  /** Long-poll interval when a queue is empty. */
  pollIntervalMs?: number;
  /** Port for `GET /health` (200 healthy, 503 draining). */
  healthPort?: number;
  /** SIGTERM drain window before the process exits. */
  shutdownGraceSeconds?: number;
  logger?: Logger;
};

type ReadRow = { msg_id: number; read_ct: number; message: JobEnvelope };

export async function runWorker(options: RunWorkerOptions): Promise<() => Promise<void>> {
  const logger =
    options.logger ?? createLogger({ service: options.service, env: process.env.NODE_ENV });
  const retry = options.retry ?? DEFAULT_RETRY;
  const visibility = options.visibilityTimeoutSeconds ?? 60;
  const pollInterval = options.pollIntervalMs ?? 2000;
  const sql = postgres(options.databaseUrl, { max: 4, prepare: false });

  let draining = false;
  const health = startHealthServer(options.healthPort ?? 8081, () => !draining);

  const loop = (async () => {
    while (!draining) {
      let processedAny = false;
      for (const queue of options.queues) {
        if (draining) break;
        try {
          const rows = (await sql`
            select msg_id, read_ct, message
            from pgmq.read(${queue}, ${visibility}, 1)
          `) as unknown as ReadRow[];
          if (rows.length === 0) continue;
          processedAny = true;
          for (const row of rows) {
            await handleMessage({ sql, queue, row, registry: options.registry, retry, logger });
          }
        } catch (err) {
          logger.error({ err, queue }, 'pgmq read failed');
          await sleep(pollInterval);
        }
      }
      if (!processedAny) await sleep(pollInterval);
    }
    await sql.end({ timeout: 5 });
  })();

  const shutdown = async (): Promise<void> => {
    if (draining) return loop;
    draining = true;
    logger.warn('worker draining');
    await Promise.race([loop, sleep((options.shutdownGraceSeconds ?? 30) * 1000)]);
    health.close();
  };

  attachSignalHandlers(shutdown, logger);
  return shutdown;
}

async function handleMessage({
  sql,
  queue,
  row,
  registry,
  retry,
  logger,
}: {
  sql: ReturnType<typeof postgres>;
  queue: string;
  row: ReadRow;
  registry: JobRegistry;
  retry: RetryPolicy;
  logger: Logger;
}): Promise<void> {
  const parsed = ENVELOPE_SCHEMA.safeParse(row.message);
  if (!parsed.success) {
    logger.error({ err: parsed.error.format(), msgId: row.msg_id }, 'invalid envelope, archiving');
    await sql`select pgmq.archive(${queue}::text, ${row.msg_id}::bigint)`;
    return;
  }
  const envelope = parsed.data;
  const job = registry.get(envelope.name);
  if (!job) {
    logger.error({ name: envelope.name, msgId: row.msg_id }, 'no handler for job, archiving');
    await sql`select pgmq.archive(${queue}::text, ${row.msg_id}::bigint)`;
    return;
  }

  const policy = job.retry ?? retry;
  const attempt = envelope.attempt + 1; // read_ct counts deliveries; we trust envelope attempt
  const ctx = {
    jobName: envelope.name,
    attempt,
    enqueuedAt: envelope.enqueuedAt,
    msgId: row.msg_id,
  };

  await withContext({ job_id: String(row.msg_id) }, () =>
    withTraceContext(envelope.traceparent, `job ${envelope.name}`, async () => {
      try {
        const payload = job.payload.parse(envelope.payload);
        await job.handler(payload, ctx);
        await sql`select pgmq.delete(${queue}::text, ${row.msg_id}::bigint)`;
        logger.info({ name: envelope.name, msgId: row.msg_id, attempt }, 'job ok');
      } catch (err) {
        logger.error({ err, name: envelope.name, attempt }, 'job failed');
        if (attempt >= policy.maxAttempts) {
          await sql`select pgmq.archive(${queue}::text, ${row.msg_id}::bigint)`;
          return;
        }
        const backoff = policy.scheduleSeconds[attempt - 1] ?? policy.scheduleSeconds[policy.scheduleSeconds.length - 1] ?? 0;
        const nextEnvelope = { ...envelope, attempt };
        await sql`select pgmq.delete(${queue}::text, ${row.msg_id}::bigint)`;
        await sql`select pgmq.send(${queue}::text, ${JSON.stringify(nextEnvelope)}::jsonb, ${backoff}::integer)`;
      }
    }),
  );
}

function startHealthServer(port: number, healthy: () => boolean): Server {
  const server = createServer((req, res) => {
    if (req.url === '/health') {
      const ok = healthy();
      res.statusCode = ok ? 200 : 503;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok }));
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  server.listen(port);
  return server;
}

function attachSignalHandlers(shutdown: () => Promise<void>, logger: Logger): void {
  const onSignal = (sig: NodeJS.Signals) => {
    logger.warn({ sig }, 'received signal — draining');
    void shutdown().then(() => process.exit(0));
  };
  process.once('SIGTERM', onSignal);
  process.once('SIGINT', onSignal);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
