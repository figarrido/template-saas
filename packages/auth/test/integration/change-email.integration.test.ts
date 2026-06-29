import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { signIn } from '../../src/flows/sign-in.js';
import { changeEmail } from '../../src/flows/change-email.js';
import {
  SUPABASE_PUBLISHABLE_KEY,
  anonClient,
  createAuthUser,
  deleteAuthUserById,
  endServiceSql,
  serviceSql,
} from './setup.js';

// Cases mirror issue #7 acceptance criteria:
//   * Correct current password + a new address → ok. The new address is
//     PENDING (auth.users.email_change) — the row's `email` is unchanged
//     until both confirmation links are clicked (`double_confirm_changes =
//     true`), so the User can still sign in with the old address.
//   * Wrong current password → generic invalid-credentials; nothing
//     pending in auth.users.email_change.
//
// The OAuth-only branch is covered by the unit test in flows.test.ts.

const USER_ID = '77777777-7777-7777-7777-777777777776';
const ORIGINAL_EMAIL = 'integration-changeemail@template.test';
const INITIAL_PASSWORD = 'correct-horse-battery-staple';

const haveSupabaseEnv = SUPABASE_PUBLISHABLE_KEY !== '';
const itLive = haveSupabaseEnv ? it : it.skip;

function newPendingEmail(): string {
  return `pending-${crypto.randomUUID()}@template.test`;
}

beforeEach(async () => {
  if (!haveSupabaseEnv) return;
  // Re-create the fixture cleanly each run — a previous successful change-
  // email leaves `email_change` populated and we want each case to start
  // from the same baseline.
  await deleteAuthUserById(USER_ID);
  await createAuthUser({
    id: USER_ID,
    email: ORIGINAL_EMAIL,
    password: INITIAL_PASSWORD,
    confirmed: true,
  });
});

afterAll(async () => {
  if (!haveSupabaseEnv) return;
  await deleteAuthUserById(USER_ID);
  await endServiceSql();
});

describe('changeEmail — integration (live Supabase)', () => {
  itLive('requests a pending email change when the current password matches; old address still signs in', async () => {
    const newEmail = newPendingEmail();
    const client = anonClient();
    await signIn(client, { email: ORIGINAL_EMAIL, password: INITIAL_PASSWORD });

    const result = await changeEmail(client, {
      currentPassword: INITIAL_PASSWORD,
      newEmail,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.message).toMatch(/both inboxes/i);

    // The row's `email` is unchanged — only `email_change` carries the
    // pending value until the User confirms both links.
    const rows = await serviceSql<
      Array<{ email: string; email_change: string | null }>
    >`select email, email_change from auth.users where id = ${USER_ID}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe(ORIGINAL_EMAIL);
    expect(rows[0]?.email_change).toBe(newEmail);

    // The User can still sign in with the OLD email — acceptance criterion
    // "the User can still sign in with the old email until then".
    const stillOld = await signIn(anonClient(), {
      email: ORIGINAL_EMAIL,
      password: INITIAL_PASSWORD,
    });
    expect(stillOld.ok).toBe(true);

    // …and NOT with the new one — it's not active yet.
    const withNew = await signIn(anonClient(), {
      email: newEmail,
      password: INITIAL_PASSWORD,
    });
    expect(withNew.ok).toBe(false);
    if (withNew.ok) return;
    expect(withNew.code).toBe('invalid-credentials');
  });

  itLive('rejects a wrong current password with a generic error and never queues a pending change', async () => {
    const newEmail = newPendingEmail();
    const client = anonClient();
    await signIn(client, { email: ORIGINAL_EMAIL, password: INITIAL_PASSWORD });

    const result = await changeEmail(client, {
      currentPassword: 'definitely-not-it',
      newEmail,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('invalid-credentials');
    expect(result.error).toMatch(/current password/i);

    // Nothing was queued — the row's `email_change` is empty, `email`
    // unchanged.
    const rows = await serviceSql<
      Array<{ email: string; email_change: string | null }>
    >`select email, email_change from auth.users where id = ${USER_ID}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe(ORIGINAL_EMAIL);
    // Postgres normalises empty-string defaults; either '' or null means
    // "no pending change".
    expect(rows[0]?.email_change === null || rows[0]?.email_change === '').toBe(true);
  });
});
