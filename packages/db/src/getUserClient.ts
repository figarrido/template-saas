import { createServerClient } from '@supabase/ssr';
import type { Database } from './types/database.types.js';

export type CookieToSet = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

export type CookieAdapter = {
  getAll(): Array<{ name: string; value: string }>;
  setAll(cookies: CookieToSet[]): void;
};

export type UserClientConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  cookies: CookieAdapter;
};

/**
 * RLS-honoring Supabase client for `apps/web`.
 *
 * Every query made through this client carries the user's JWT and is bound
 * by the policies in supabase/migrations/20260616180007_rls_policies.sql.
 * Never instantiate this with the service-role key.
 *
 * The caller provides a cookie adapter so the same factory works in Next.js
 * Server Actions, Route Handlers, and middleware. See
 * docs/architecture/02-data.md § Query layer.
 */
export function getUserClient(config: UserClientConfig) {
  return createServerClient<Database>(config.supabaseUrl, config.supabaseAnonKey, {
    cookies: {
      getAll: () => config.cookies.getAll(),
      setAll: (cookies: CookieToSet[]) => config.cookies.setAll(cookies),
    },
  });
}

export type UserClient = ReturnType<typeof getUserClient>;
