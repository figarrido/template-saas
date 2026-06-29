import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { signIn } from '../../src/flows/sign-in.js';
import { changePassword } from '../../src/flows/change-password.js';
import {
  SUPABASE_PUBLISHABLE_KEY,
  anonClient,
  createAuthUser,
  deleteAuthUserById,
  endServiceSql,
} from './setup.js';

// Cases mirror issue #6 acceptance criteria:
//   * correct current + new policy-compliant password → ok; new password works.
//   * wrong current password → generic invalid-credentials; old password
//     still works (the row wasn't touched).
//
// The OAuth-only branch is covered by the unit test in flows.test.ts; we
// don't seed an oauth Identity here because Supabase resists creating one
// without a real IdP round-trip.

const USER_ID = '77777777-7777-7777-7777-777777777774';
const EMAIL = 'integration-changepw@template.test';
const INITIAL_PASSWORD = 'correct-horse-battery-staple';
const STRONG_NEW = 'kale-bicycle-merlot-rebound';

const haveSupabaseEnv = SUPABASE_PUBLISHABLE_KEY !== '';
const itLive = haveSupabaseEnv ? it : it.skip;

beforeEach(async () => {
  if (!haveSupabaseEnv) return;
  // Upsert the fixture with the initial password before every case so the
  // suite works regardless of which test ran first (a passing change-
  // password case mutates the row).
  await createAuthUser({
    id: USER_ID,
    email: EMAIL,
    password: INITIAL_PASSWORD,
    confirmed: true,
  });
});

afterAll(async () => {
  if (!haveSupabaseEnv) return;
  await deleteAuthUserById(USER_ID);
  await endServiceSql();
});

describe('changePassword — integration (live Supabase)', () => {
  itLive('changes the password when the current password matches', async () => {
    const client = anonClient();
    await signIn(client, { email: EMAIL, password: INITIAL_PASSWORD });

    const result = await changePassword(client, {
      currentPassword: INITIAL_PASSWORD,
      newPassword: STRONG_NEW,
    });
    expect(result.ok).toBe(true);

    // The new password works.
    const after = await signIn(anonClient(), { email: EMAIL, password: STRONG_NEW });
    expect(after.ok).toBe(true);

    // The old password no longer does.
    const stillOld = await signIn(anonClient(), { email: EMAIL, password: INITIAL_PASSWORD });
    expect(stillOld.ok).toBe(false);
    if (stillOld.ok) return;
    expect(stillOld.code).toBe('invalid-credentials');
  });

  itLive('rejects a wrong current password with a generic error and leaves the password unchanged', async () => {
    const client = anonClient();
    await signIn(client, { email: EMAIL, password: INITIAL_PASSWORD });

    const result = await changePassword(client, {
      currentPassword: 'definitely-not-it',
      newPassword: STRONG_NEW,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('invalid-credentials');

    // The original password still works.
    const still = await signIn(anonClient(), { email: EMAIL, password: INITIAL_PASSWORD });
    expect(still.ok).toBe(true);

    // The attempted new password does not.
    const newAttempt = await signIn(anonClient(), { email: EMAIL, password: STRONG_NEW });
    expect(newAttempt.ok).toBe(false);
  });
});
