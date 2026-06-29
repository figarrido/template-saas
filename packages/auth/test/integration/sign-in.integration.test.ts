import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signIn } from '../../src/flows/sign-in.js';
import { signOut } from '../../src/flows/sign-out.js';
import {
  SUPABASE_PUBLISHABLE_KEY,
  anonClient,
  createAuthUser,
  deleteAuthUserById,
  endServiceSql,
} from './setup.js';

// Cases mirror the parent PRD's "primary seam" list and the issue #3
// acceptance criteria:
//   * positive sign-in for a confirmed user → ok + session
//   * wrong password → generic error (no enumeration)
//   * unknown email → generic error (no enumeration)
//   * correct password + unconfirmed account → "email not confirmed"
//   * sign-out uses scope:'local' (other devices remain signed in)

const CONFIRMED_USER_ID = '77777777-7777-7777-7777-777777777771';
const UNCONFIRMED_USER_ID = '77777777-7777-7777-7777-777777777772';
const CONFIRMED_EMAIL = 'integration-confirmed@template.test';
const UNCONFIRMED_EMAIL = 'integration-unconfirmed@template.test';
const PASSWORD = 'correct-horse-battery-staple';

const haveSupabaseEnv = SUPABASE_PUBLISHABLE_KEY !== '';
const itLive = haveSupabaseEnv ? it : it.skip;

beforeAll(async () => {
  if (!haveSupabaseEnv) return;
  await createAuthUser({
    id: CONFIRMED_USER_ID,
    email: CONFIRMED_EMAIL,
    password: PASSWORD,
    confirmed: true,
  });
  await createAuthUser({
    id: UNCONFIRMED_USER_ID,
    email: UNCONFIRMED_EMAIL,
    password: PASSWORD,
    confirmed: false,
  });
});

afterAll(async () => {
  if (!haveSupabaseEnv) return;
  await deleteAuthUserById(CONFIRMED_USER_ID);
  await deleteAuthUserById(UNCONFIRMED_USER_ID);
  await endServiceSql();
});

describe('signIn — integration (live Supabase)', () => {
  itLive('signs a confirmed User in and returns a persistent Session', async () => {
    const client = anonClient();
    const result = await signIn(client, { email: CONFIRMED_EMAIL, password: PASSWORD });
    expect(result).toEqual({ ok: true, data: { userId: CONFIRMED_USER_ID } });

    const { data } = await client.auth.getSession();
    expect(data.session?.user.id).toBe(CONFIRMED_USER_ID);
  });

  itLive('returns the generic "invalid email or password" error for a wrong password', async () => {
    const result = await signIn(anonClient(), { email: CONFIRMED_EMAIL, password: 'nope' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('invalid-credentials');
    expect(result.error).toBe('Invalid email or password.');
  });

  itLive('returns the generic "invalid email or password" error for an unknown email', async () => {
    const result = await signIn(anonClient(), {
      email: 'nobody-here@template.test',
      password: PASSWORD,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('invalid-credentials');
  });

  itLive('surfaces "email not confirmed" only on the correct-password + unconfirmed branch', async () => {
    const wrong = await signIn(anonClient(), { email: UNCONFIRMED_EMAIL, password: 'nope' });
    expect(wrong.ok).toBe(false);
    if (wrong.ok) return;
    expect(wrong.code).toBe('invalid-credentials');

    const right = await signIn(anonClient(), { email: UNCONFIRMED_EMAIL, password: PASSWORD });
    expect(right.ok).toBe(false);
    if (right.ok) return;
    expect(right.code).toBe('not-confirmed');
    expect(right.error).toMatch(/not confirmed/i);
  });
});

describe('signOut — integration (live Supabase)', () => {
  itLive('clears the local Session', async () => {
    const client = anonClient();
    await signIn(client, { email: CONFIRMED_EMAIL, password: PASSWORD });

    const before = await client.auth.getSession();
    expect(before.data.session).not.toBeNull();

    const result = await signOut(client);
    expect(result.ok).toBe(true);

    const after = await client.auth.getSession();
    expect(after.data.session).toBeNull();
  });

  itLive("does NOT revoke other devices' Sessions (scope: 'local')", async () => {
    const deviceA = anonClient();
    const deviceB = anonClient();
    await signIn(deviceA, { email: CONFIRMED_EMAIL, password: PASSWORD });
    await signIn(deviceB, { email: CONFIRMED_EMAIL, password: PASSWORD });

    const result = await signOut(deviceA);
    expect(result.ok).toBe(true);

    // Device B's refresh token must still be honored by the server — i.e.
    // the Session wasn't revoked globally.
    const refreshed = await deviceB.auth.refreshSession();
    expect(refreshed.error).toBeNull();
    expect(refreshed.data.session?.user.id).toBe(CONFIRMED_USER_ID);
  });
});
