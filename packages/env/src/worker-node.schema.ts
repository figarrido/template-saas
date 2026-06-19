import { z } from 'zod';
import { sharedDescriptions, sharedExamples, sharedServer } from './shared.js';
import type { SurfaceSchema } from './describe.js';

export const workerNodeServer = {
  ...sharedServer,
  WORKER_DATABASE_URL: z.string().url(),
  WORKER_HEALTH_PORT: z.coerce.number().int().positive().default(8081),
  WORKER_QUEUES: z.string().default('default,emails,billing'),
  SHUTDOWN_GRACE_SECONDS: z.coerce.number().int().positive().default(30),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
};

export const workerNodeSchema: SurfaceSchema = {
  surface: 'worker-node',
  server: workerNodeServer,
  examples: {
    ...sharedExamples,
    WORKER_DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54422/postgres',
    WORKER_HEALTH_PORT: '8081',
    WORKER_QUEUES: 'default,emails,billing',
    SHUTDOWN_GRACE_SECONDS: '30',
  },
  descriptions: {
    ...sharedDescriptions,
    WORKER_DATABASE_URL: 'Direct Postgres connection used by Drizzle in workers.',
    WORKER_HEALTH_PORT: 'Port for `GET /health`. Required by Railway.',
    WORKER_QUEUES: 'Comma-separated pgmq queue names this worker subscribes to.',
    SHUTDOWN_GRACE_SECONDS: 'SIGTERM drain window before forced exit.',
  },
};
