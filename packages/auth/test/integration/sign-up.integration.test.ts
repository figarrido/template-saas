import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { signUp } from '../../src/flows/sign-up.js';
import {
  SUPABASE_PUBLISHABLE_KEY,
  anonClient,
  createAuthUser,
  deleteAuthUserById,
  endServiceSql,
  serviceSql,
} from './setup.js';

// Cases mirror issue #4 acceptance criteria + the parent PRD § Testing:
//   * fresh email → generic "check your email" success and an unconfirmed
//     auth.users row exists, with NO Session attached to the client.
//   * already-registered email → the SAME generic response (no
//     enumeration leak; ADR-0002). The pre-existing row is NOT clobbered.

const EXISTING_USER_ID = '77777777-7777-7777-7777-777777777773';
const EXISTING_EMAIL = 'integration-existing@template.test';
const EXISTING_PASSWORD = 'correct-horse-battery-staple';
const STRONG_PASSWORD = 'kale-bicycle-merlot-rebound';

const haveSupabaseEnv = SUPABASE_PUBLISHABLE_KEY !== '';
const itLive = haveSupabaseEnv ? it : it.skip;

// Track every test-created email so afterEach can clean up regardless of
// whether the test asserted on the new user id (sign-up returns a generic
// success so the id isn't easily available to the caller).
const provisioned: string[] = [];

function newEmail(): string {
  // Vitest assigns each test a unique `expect.getState().currentTestName`,
  // but a per-test unique email is simpler and reuse-proof. Use Postgres'
  // gen_random_uuid via serviceSql to dodge the no-Math.random restriction
  // we have in workflow scripts — here in test code we can use the runtime
  // randomness Vitest provides through `crypto.randomUUID`.
  return `signup-${crypto.randomUUID()}@template.test`;
}

beforeAll(async () => {
  if (!haveSupabaseEnv) return;
  await createAuthUser({
    id: EXISTING_USER_ID,
    email: EXISTING_EMAIL,
    password: EXISTING_PASSWORD,
    confirmed: true,
  });
});

afterAll(async () => {
  if (!haveSupabaseEnv) return;
  await deleteAuthUserById(EXISTING_USER_ID);
  await endServiceSql();
});

afterEach(async () => {
  if (!haveSupabaseEnv || provisioned.length === 0) return;
  // supabase-js' signUp inserts into auth.users; clean them up by email.
  await serviceSql`delete from auth.users where email = any(${serviceSql.array(provisioned)})`;
  provisioned.length = 0;
});

describe('signUp — integration (live Supabase)', () => {
  itLive('creates an unconfirmed User with no Session and returns the generic interstitial', async () => {
    const email = newEmail();
    provisioned.push(email);

    const client = anonClient();
    const result = await signUp(client, { email, password: STRONG_PASSWORD });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.message).toMatch(/check your email/i);

    // No Session — verification is required before first sign-in.
    const { data } = await client.auth.getSession();
    expect(data.session).toBeNull();

    // auth.users row exists, with email_confirmed_at NULL.
    const rows = await serviceSql<
      Array<{ id: string; email_confirmed_at: Date | null }>
    >`select id, email_confirmed_at from auth.users where email = ${email}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email_confirmed_at).toBeNull();
  });

  itLive('returns the SAME generic response for an already-registered email (no enumeration leak)', async () => {
    const freshEmail = newEmail();
    provisioned.push(freshEmail);

    const fresh = await signUp(anonClient(), { email: freshEmail, password: STRONG_PASSWORD });
    const duplicate = await signUp(anonClient(), {
      email: EXISTING_EMAIL,
      password: STRONG_PASSWORD,
    });

    // Indistinguishable result shapes — the call site cannot tell the
    // two cases apart, and neither can a curious sign-up enumerator.
    expect(duplicate).toEqual(fresh);
    if (!duplicate.ok) return;
    expect(duplicate.data.message).toMatch(/check your email/i);

    // The pre-existing confirmed user was NOT overwritten.
    const rows = await serviceSql<
      Array<{ id: string; email_confirmed_at: Date | null }>
    >`select id, email_confirmed_at from auth.users where email = ${EXISTING_EMAIL}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(EXISTING_USER_ID);
    expect(rows[0]?.email_confirmed_at).not.toBeNull();
  });
});
