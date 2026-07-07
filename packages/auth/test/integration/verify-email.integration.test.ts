import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { verifyEmailToken } from '../../src/flows/verify-email.js';
import { updatePassword } from '../../src/flows/update-password.js';
import { signIn } from '../../src/flows/sign-in.js';
import {
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  anonClient,
  createAuthUser,
  deleteAuthUserByEmail,
  endServiceSql,
  generateEmailOtp,
  serviceClient,
  serviceSql,
} from './setup.js';

// The `/auth/confirm` Route Handler dispatches every auth-email landing into
// `verifyEmailToken`. The unit suite (test/flows.test.ts) pins the mapping
// with a fake client; here we drive the REAL `verifyOtp` path against a
// genuine Supabase-issued `token_hash` minted through the admin API, so the
// consume-once and type-dispatch behaviour is exercised end-to-end:
//   * signup token   → confirms the account and establishes a Session.
//   * recovery token → establishes the recovery Session updatePassword needs.
//   * a consumed token cannot be replayed (single-use).
//   * a malformed / empty token is rejected without a Session.

const PASSWORD = 'correct-horse-battery-staple';

// Both keys are required — the anon client drives the flow, the service
// client mints the tokens. Locally: `eval "$(supabase status -o env)"` then
// export SUPABASE_PUBLISHABLE_KEY / SUPABASE_SERVICE_ROLE_KEY (see CI).
const haveEnv = SUPABASE_PUBLISHABLE_KEY !== '' && SUPABASE_SERVICE_ROLE_KEY !== '';
const itLive = haveEnv ? it : it.skip;

const provisioned: string[] = [];

function newEmail(prefix: string): string {
  const email = `${prefix}-${crypto.randomUUID()}@template.test`;
  provisioned.push(email);
  return email;
}

afterEach(async () => {
  if (!haveEnv || provisioned.length === 0) return;
  await serviceSql`delete from auth.users where email = any(${serviceSql.array(provisioned)})`;
  provisioned.length = 0;
});

afterAll(async () => {
  if (!haveEnv) return;
  await endServiceSql();
});

describe('verifyEmailToken — signup (integration, live Supabase)', () => {
  itLive('confirms the account and lands the User signed in', async () => {
    const admin = serviceClient();
    const email = newEmail('verify-signup');
    const { tokenHash } = await generateEmailOtp(admin, { type: 'signup', email, password: PASSWORD });

    const client = anonClient();
    const result = await verifyEmailToken(client, { tokenHash, type: 'signup' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.userId).toMatch(/^[0-9a-f-]{36}$/);

    // The verify wrote a Session onto the client — the User is signed in.
    const { data } = await client.auth.getSession();
    expect(data.session?.user.id).toBe(result.data.userId);

    // …and the account is now confirmed at the DB level.
    const rows = await serviceSql<
      Array<{ email_confirmed_at: Date | null }>
    >`select email_confirmed_at from auth.users where email = ${email}`;
    expect(rows[0]?.email_confirmed_at).not.toBeNull();
  });

  itLive('rejects a token that was already consumed (single-use)', async () => {
    const admin = serviceClient();
    const email = newEmail('verify-reuse');
    const { tokenHash } = await generateEmailOtp(admin, { type: 'signup', email, password: PASSWORD });

    const first = await verifyEmailToken(anonClient(), { tokenHash, type: 'signup' });
    expect(first.ok).toBe(true);

    // Replaying the same token_hash must fail with the generic "no longer
    // valid" copy — the confirm link is one-shot.
    const second = await verifyEmailToken(anonClient(), { tokenHash, type: 'signup' });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error).toMatch(/no longer valid/i);
  });
});

describe('verifyEmailToken — recovery (integration, live Supabase)', () => {
  itLive('establishes the recovery Session that updatePassword runs against', async () => {
    const admin = serviceClient();
    const email = newEmail('verify-recovery');
    const newPassword = 'fresh-kale-bicycle-merlot';
    await createAuthUser({ id: crypto.randomUUID(), email, password: PASSWORD, confirmed: true });

    const { tokenHash } = await generateEmailOtp(admin, { type: 'recovery', email });

    // /auth/confirm verifies the recovery token, which writes the Session
    // cookies; /reset-password then calls updatePassword on that client.
    const client = anonClient();
    const verified = await verifyEmailToken(client, { tokenHash, type: 'recovery' });
    expect(verified.ok).toBe(true);

    const updated = await updatePassword(client, { password: newPassword });
    expect(updated.ok).toBe(true);

    // The new password now signs in; the old one no longer does.
    const withNew = await signIn(anonClient(), { email, password: newPassword });
    expect(withNew.ok).toBe(true);
    const withOld = await signIn(anonClient(), { email, password: PASSWORD });
    expect(withOld.ok).toBe(false);
  });
});

describe('verifyEmailToken — malformed input (integration, live Supabase)', () => {
  itLive('rejects an empty token_hash without a Session', async () => {
    const client = anonClient();
    const result = await verifyEmailToken(client, { tokenHash: '', type: 'signup' });
    expect(result.ok).toBe(false);

    const { data } = await client.auth.getSession();
    expect(data.session).toBeNull();
  });

  itLive('rejects a well-formed-but-unknown token_hash', async () => {
    const result = await verifyEmailToken(anonClient(), {
      // Shaped like a real pkce token but never issued.
      tokenHash: `pkce_${'0'.repeat(56)}`,
      type: 'signup',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/no longer valid/i);
  });
});
