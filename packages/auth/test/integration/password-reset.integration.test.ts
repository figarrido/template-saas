import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { requestPasswordReset } from '../../src/flows/request-password-reset.js';
import { updatePassword } from '../../src/flows/update-password.js';
import { signIn } from '../../src/flows/sign-in.js';
import {
  SUPABASE_PUBLISHABLE_KEY,
  anonClient,
  createAuthUser,
  deleteAuthUserById,
  endServiceSql,
} from './setup.js';

// Cases mirror issue #5 acceptance criteria:
//   * Requesting a reset always returns the generic "if an account
//     exists..." response, regardless of whether the email is registered.
//   * After a successful reset, the current device stays signed in and
//     all of the User's OTHER Sessions are revoked.
//
// The recovery email itself is delivered by Supabase via the send_email
// hook and exercised by the apps/web Playwright E2E — here we focus on
// the flow-function contracts. To get a "recovery Session" without
// scraping InBucket we sign the User in with their current password
// against the anon client: the resulting Session is what updatePassword
// will run against, exactly the same posture as the cookie-bound client
// in /reset-password.

const USER_ID = '77777777-7777-7777-7777-777777777775';
const USER_EMAIL = 'integration-reset@template.test';
const ORIGINAL_PASSWORD = 'correct-horse-battery-staple';
const NEW_PASSWORD = 'fresh-kale-bicycle-merlot';

const haveSupabaseEnv = SUPABASE_PUBLISHABLE_KEY !== '';
const itLive = haveSupabaseEnv ? it : it.skip;

beforeAll(async () => {
  if (!haveSupabaseEnv) return;
  await createAuthUser({
    id: USER_ID,
    email: USER_EMAIL,
    password: ORIGINAL_PASSWORD,
    confirmed: true,
  });
});

afterAll(async () => {
  if (!haveSupabaseEnv) return;
  await deleteAuthUserById(USER_ID);
  await endServiceSql();
});

describe('requestPasswordReset — integration (live Supabase)', () => {
  itLive('returns the SAME generic response for a registered email and an unknown email (no enumeration)', async () => {
    const registered = await requestPasswordReset(anonClient(), { email: USER_EMAIL });
    const unknown = await requestPasswordReset(anonClient(), {
      email: `nobody-${crypto.randomUUID()}@template.test`,
    });

    expect(registered).toEqual(unknown);
    expect(registered.ok).toBe(true);
    if (!registered.ok) return;
    expect(registered.data.message).toMatch(/if an account exists/i);
  });

  itLive('still returns the generic response for a malformed email (no validation-error leak)', async () => {
    const result = await requestPasswordReset(anonClient(), { email: 'not-an-email' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.message).toMatch(/if an account exists/i);
  });
});

describe('updatePassword — integration (live Supabase)', () => {
  itLive('sets a new password the User can sign in with, and the old one stops working', async () => {
    const device = anonClient();
    const signedIn = await signIn(device, { email: USER_EMAIL, password: ORIGINAL_PASSWORD });
    expect(signedIn.ok).toBe(true);

    const updated = await updatePassword(device, { password: NEW_PASSWORD });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.data.message).toMatch(/updated/i);

    // Old password no longer works — sign-in surfaces the generic error.
    const withOld = await signIn(anonClient(), { email: USER_EMAIL, password: ORIGINAL_PASSWORD });
    expect(withOld.ok).toBe(false);
    if (withOld.ok) return;
    expect(withOld.code).toBe('invalid-credentials');

    // New password works.
    const withNew = await signIn(anonClient(), { email: USER_EMAIL, password: NEW_PASSWORD });
    expect(withNew.ok).toBe(true);

    // Restore for downstream cases — keep teardown simple.
    await updatePassword(
      await signedInDevice(USER_EMAIL, NEW_PASSWORD),
      { password: ORIGINAL_PASSWORD },
    );
  });

  itLive('keeps the current device signed in and revokes every OTHER Session', async () => {
    const deviceA = anonClient();
    const deviceB = anonClient();
    const a = await signIn(deviceA, { email: USER_EMAIL, password: ORIGINAL_PASSWORD });
    const b = await signIn(deviceB, { email: USER_EMAIL, password: ORIGINAL_PASSWORD });
    expect(a.ok && b.ok).toBe(true);

    const before = await deviceB.auth.refreshSession();
    expect(before.error).toBeNull();

    // Device A is the "recovery" device — it sets a new password.
    const updated = await updatePassword(deviceA, { password: NEW_PASSWORD });
    expect(updated.ok).toBe(true);

    // Device A's Session is intact — the issue requires the User to stay
    // signed in on the current device after the reset.
    const aStillIn = await deviceA.auth.getSession();
    expect(aStillIn.data.session?.user.id).toBe(USER_ID);

    // Device B's refresh token has been revoked — the next refresh fails
    // (the server-side Session is gone).
    const after = await deviceB.auth.refreshSession();
    expect(after.error).not.toBeNull();

    // Restore so subsequent runs of the file are idempotent.
    await updatePassword(deviceA, { password: ORIGINAL_PASSWORD });
  });

  itLive('rejects the update without a Session (recovery link expired / never landed)', async () => {
    const client = anonClient();
    const { data } = await client.auth.getSession();
    expect(data.session).toBeNull();

    const result = await updatePassword(client, { password: NEW_PASSWORD });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('invalid-credentials');
    expect(result.error).toMatch(/no longer valid/i);
  });
});

async function signedInDevice(email: string, password: string) {
  const client = anonClient();
  const result = await signIn(client, { email, password });
  if (!result.ok) {
    throw new Error(`signedInDevice: ${result.error}`);
  }
  return client;
}
