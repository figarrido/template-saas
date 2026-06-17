import { runWorker } from '@template/jobs';
import { initOtel, createLogger } from '@template/observability';
import { env } from '@template/env/worker-node';
import registry from './registry.js';

const logger = createLogger({ service: 'worker-node', release: env.RELEASE });

initOtel({ service: 'worker-node', release: env.RELEASE, env: env.NODE_ENV });

const queues = env.WORKER_QUEUES.split(',').map((q) => q.trim()).filter(Boolean);
logger.info({ queues, healthPort: env.WORKER_HEALTH_PORT }, 'worker starting');

await runWorker({
  registry,
  databaseUrl: env.WORKER_DATABASE_URL,
  queues,
  service: 'worker-node',
  healthPort: env.WORKER_HEALTH_PORT,
  shutdownGraceSeconds: env.SHUTDOWN_GRACE_SECONDS,
  logger,
});
