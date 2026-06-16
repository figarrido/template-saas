import { createEnv } from '@t3-oss/env-core';
import { workerNodeSchema, workerNodeServer } from './worker-node.schema.js';

export { workerNodeSchema };

export const env = createEnv({
  server: workerNodeServer,
  runtimeEnv: process.env as unknown as Record<string, string | undefined>,
  emptyStringAsUndefined: true,
  skipValidation: process.env.SKIP_ENV_VALIDATION === 'true',
});
