import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './drizzle/schema.js';

export type ServiceClientConfig = {
  databaseUrl: string;
  max?: number;
};

let cached: ReturnType<typeof drizzle<typeof schema>> | undefined;

/**
 * Service-role Drizzle client. Bypasses RLS by design.
 *
 * Use only from `apps/admin`, `services/*`, server-side webhooks, and worker
 * jobs that legitimately operate across tenants. The shared ESLint preset
 * (`@template/config/eslint/next`) exports `banServiceClient` so consumer
 * apps can refuse imports — apps/web MUST opt in to that rule. See
 * docs/architecture/02-data.md § Query layer.
 *
 * @server-only
 */
export function getServiceClient(config: ServiceClientConfig) {
  if (cached) return cached;
  const sql = postgres(config.databaseUrl, {
    max: config.max ?? 10,
    prepare: false,
  });
  cached = drizzle(sql, { schema });
  return cached;
}

export type ServiceClient = ReturnType<typeof getServiceClient>;

export { schema };
