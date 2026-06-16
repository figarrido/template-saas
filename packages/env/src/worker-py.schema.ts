import { z } from 'zod';
import { sharedDescriptions, sharedExamples, sharedServer } from './shared.js';
import type { SurfaceSchema } from './describe.js';

// Source of truth for the Python worker's env. The Python worker reads env via
// pydantic-settings; this descriptor drives generation of its .env.example.
export const workerPyServer = {
  ...sharedServer,
  WORKER_DATABASE_URL: z.string().url(),
  WORKER_HEALTH_PORT: z.coerce.number().int().positive().default(8082),
  WORKER_QUEUES: z.string().default('default'),
  SHUTDOWN_GRACE_SECONDS: z.coerce.number().int().positive().default(30),
};

export const workerPySchema: SurfaceSchema = {
  surface: 'worker-py',
  server: workerPyServer,
  examples: {
    ...sharedExamples,
    WORKER_DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
    WORKER_HEALTH_PORT: '8082',
    WORKER_QUEUES: 'default',
    SHUTDOWN_GRACE_SECONDS: '30',
  },
  descriptions: {
    ...sharedDescriptions,
    WORKER_DATABASE_URL: 'Direct Postgres connection used by the Python worker.',
    WORKER_HEALTH_PORT: 'Port for `GET /health`.',
    WORKER_QUEUES: 'Comma-separated pgmq queue names this worker subscribes to.',
    SHUTDOWN_GRACE_SECONDS: 'SIGTERM drain window before forced exit.',
  },
};
