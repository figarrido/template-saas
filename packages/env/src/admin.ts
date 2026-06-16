import { createEnv } from '@t3-oss/env-nextjs';
import { adminClient, adminSchema, adminServer } from './admin.schema.js';

export { adminSchema };

export const env = createEnv({
  server: adminServer,
  client: adminClient,
  runtimeEnv: process.env as unknown as Record<string, string | undefined>,
  emptyStringAsUndefined: true,
  skipValidation: process.env.SKIP_ENV_VALIDATION === 'true',
});
