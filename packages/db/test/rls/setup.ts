import postgres from 'postgres';

// Service-role connection. Bypasses RLS — used to set up fixtures and to
// confirm cross-tenant denial would be visible to admin tools.
export const serviceSql = postgres(
  process.env.WORKER_DATABASE_URL ??
    'postgresql://postgres:postgres@127.0.0.1:54422/postgres',
  { max: 4, prepare: false },
);

/**
 * Runs `fn` inside a transaction with the connection acting as the given
 * authenticated user — the same posture as `apps/web` going through
 * `getUserClient`. The transaction is rolled back when `fn` returns, so
 * tests cannot pollute each other's state.
 *
 * Uses Postgres GUCs (`request.jwt.claims`) the way Supabase auth.uid()
 * resolves them, so RLS policies behave identically to runtime.
 */
export async function asUser<T>(
  userId: string,
  fn: (sql: ReturnType<typeof postgres>) => Promise<T>,
): Promise<T> {
  return serviceSql.begin(async (tx) => {
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({
      sub: userId,
      role: 'authenticated',
    })}, true)`;
    return fn(tx as unknown as ReturnType<typeof postgres>);
  }) as Promise<T>;
}

// Seeded fixture IDs (see supabase/seed.sql).
export const SEED = {
  adminUserId: '11111111-1111-1111-1111-111111111111',
  regularUserId: '22222222-2222-2222-2222-222222222222',
  orgId: '33333333-3333-3333-3333-333333333333',
  planId: '44444444-4444-4444-4444-444444444444',
} as const;
