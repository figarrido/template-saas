import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './drizzle/schema.js';

export type ServiceClientConfig = {
  databaseUrl: string;
  max?: number;
};

let cached: ReturnType<typeof drizzle<typeof schema>> | undefined;

/**
 * Cross-tenant Drizzle client. Bypasses RLS by design.
 *
 * `databaseUrl` must connect as the scoped `app_service` role (BYPASSRLS,
 * DML-only, no DDL/ownership) — see supabase/migrations/*_app_service_role.sql
 * and docs/architecture/02-data.md § Query layer — NOT the `postgres` owner and
 * NOT the service-role JWT (that key is a PostgREST concept and cannot back a
 * Postgres connection). The role bypasses RLS the same way the owner did, but
 * cannot drop tables, alter roles, or disable RLS if a call site is compromised.
 *
 * Use only from `apps/admin`, `services/*`, server-side webhooks, and worker
 * jobs that legitimately operate across tenants. The shared ESLint preset
 * (`@template/config/eslint/next`) exports `banServiceClient` so consumer
 * apps can refuse imports — apps/web MUST opt in to that rule.
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
