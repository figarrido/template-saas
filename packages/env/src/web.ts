import { createEnv } from '@t3-oss/env-nextjs';
import { webClient, webServer, webSchema } from './web.schema.js';

export { webSchema };

// Validated runtime env. Imported by `apps/web`. Generation scripts must NOT
// import this module — they consume `./web.schema.js` directly so loading it
// never triggers env validation.
export const env = createEnv({
  server: webServer,
  client: webClient,
  runtimeEnv: process.env as unknown as Record<string, string | undefined>,
  emptyStringAsUndefined: true,
  skipValidation: process.env.SKIP_ENV_VALIDATION === 'true',
});
