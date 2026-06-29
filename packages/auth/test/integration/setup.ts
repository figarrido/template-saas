import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';

// Integration harness for `packages/auth` flows. Mirrors the pattern from
// `packages/db/test/rls/setup.ts`:
//   * service-role Postgres connection for fixture create/teardown,
//   * anon/publishable Supabase client driven through the flow under test
//     (the same posture as `apps/web` → `getUserClient` at runtime).
//
// The auth integration suite is NOT included in the per-PR `unit` job —
// it runs in `migration-validation` alongside `@template/db test:rls`,
// where the local Supabase stack is already up.

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  'http://127.0.0.1:54421';

export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  '';

export const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export const DATABASE_URL =
  process.env.WORKER_DATABASE_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54422/postgres';

export const serviceSql = postgres(DATABASE_URL, { max: 4, prepare: false });

/**
 * Build a fresh anon-key Supabase client per test. Persisting the session
 * across tests would cross-contaminate them — each test owns its own
 * sign-in state.
 */
export function anonClient() {
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      storage: memoryStorage(),
    },
  });
}

function memoryStorage(): {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
} {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

/**
 * Create an auth user directly via SQL. Mirrors the bootstrap pattern in
 * supabase/seed.sql so we can stand up confirmed and unconfirmed fixtures
 * deterministically.
 */
export async function createAuthUser(opts: {
  id: string;
  email: string;
  password: string;
  confirmed: boolean;
}): Promise<void> {
  await serviceSql`
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', ${opts.id},
      'authenticated', 'authenticated', ${opts.email},
      crypt(${opts.password}, gen_salt('bf')),
      ${opts.confirmed ? serviceSql`now()` : null},
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Test User"}'::jsonb,
      now(), now(), '', '', '', ''
    )
    on conflict (id) do update set
      email = excluded.email,
      encrypted_password = excluded.encrypted_password,
      email_confirmed_at = excluded.email_confirmed_at
  `;
}

export async function deleteAuthUserById(id: string): Promise<void> {
  await serviceSql`delete from auth.users where id = ${id}`;
}

export async function endServiceSql(): Promise<void> {
  await serviceSql.end({ timeout: 5 });
}
