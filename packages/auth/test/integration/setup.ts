import postgres from 'postgres';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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

// Fixture bootstrap does direct DML on auth.users (createAuthUser below), which
// the scoped app_service runtime role intentionally cannot do. So this harness
// connects as the OWNER via SUPABASE_DB_URL — NOT WORKER_DATABASE_URL, which now
// points at app_service.
export const DATABASE_URL =
  process.env.SUPABASE_DB_URL ??
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

export async function deleteAuthUserByEmail(email: string): Promise<void> {
  await serviceSql`delete from auth.users where email = ${email}`;
}

/**
 * Service-role Supabase client. The one legitimate place outside the worker
 * services (docs/architecture/03-auth.md) — here only to mint real one-time
 * tokens via the admin API so `verifyEmailToken` can be exercised against a
 * genuine Supabase-issued `token_hash` rather than a fake.
 */
export function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, storage: memoryStorage() },
  });
}

/**
 * Mint a real Supabase one-time email token and return its `token_hash` — the
 * exact value the send-email hook would embed in a confirm link. Uses the
 * admin `generateLink` API so the integration tests can drive the real
 * `verifyOtp` path (consume-once, expiry) instead of a structural fake.
 *
 * `signup` provisions an unconfirmed User (needs a password); `recovery` and
 * `email_change` act on an existing User.
 */
export async function generateEmailOtp(
  admin: SupabaseClient,
  opts:
    | { type: 'signup'; email: string; password: string }
    | { type: 'recovery' | 'magiclink'; email: string }
    | { type: 'email_change_new'; email: string; newEmail: string },
): Promise<{ tokenHash: string }> {
  const params =
    opts.type === 'signup'
      ? { type: 'signup' as const, email: opts.email, password: opts.password }
      : opts.type === 'email_change_new'
        ? { type: 'email_change_new' as const, email: opts.email, newEmail: opts.newEmail }
        : { type: opts.type, email: opts.email };

  // supabase-js types the generateLink union tightly; the runtime accepts the
  // shape above for each branch. Cast at the call boundary only.
  const { data, error } = await admin.auth.admin.generateLink(
    params as Parameters<typeof admin.auth.admin.generateLink>[0],
  );
  if (error || !data.properties?.hashed_token) {
    throw new Error(`generateLink(${opts.type}) failed: ${error?.message ?? 'no hashed_token'}`);
  }
  return { tokenHash: data.properties.hashed_token };
}

export async function endServiceSql(): Promise<void> {
  await serviceSql.end({ timeout: 5 });
}
