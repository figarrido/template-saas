import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { resendVerification } from '../../src/flows/resend-verification.js';
import {
  SUPABASE_PUBLISHABLE_KEY,
  anonClient,
  createAuthUser,
  deleteAuthUserByEmail,
  endServiceSql,
} from './setup.js';

// resendVerification is the affordance the not-confirmed sign-in branch and
// the /check-email page hang off. Its whole contract is "always the same
// generic response" so it can't be used as an enumeration oracle (ADR-0002).
// The unit suite pins the mapping with a fake; here we confirm the real
// supabase-js `resend` call never throws and never changes shape across the
// registered-unconfirmed / registered-confirmed / unknown branches — the
// three cases a curious enumerator would probe.
//
// Delivery of the actual email is asserted by the apps/web E2E
// (resend on /check-email → a fresh message lands in Mailpit); here we stay
// at the flow-contract level and don't require the web app to be running.

const PASSWORD = 'correct-horse-battery-staple';

const haveSupabaseEnv = SUPABASE_PUBLISHABLE_KEY !== '';
const itLive = haveSupabaseEnv ? it : it.skip;

const UNCONFIRMED_EMAIL = `resend-unconfirmed-${crypto.randomUUID()}@template.test`;
const CONFIRMED_EMAIL = `resend-confirmed-${crypto.randomUUID()}@template.test`;

afterAll(async () => {
  if (!haveSupabaseEnv) return;
  await deleteAuthUserByEmail(UNCONFIRMED_EMAIL);
  await deleteAuthUserByEmail(CONFIRMED_EMAIL);
  await endServiceSql();
});

describe('resendVerification — integration (live Supabase)', () => {
  itLive('returns the same generic response for an unconfirmed, a confirmed, and an unknown address', async () => {
    await createAuthUser({
      id: crypto.randomUUID(),
      email: UNCONFIRMED_EMAIL,
      password: PASSWORD,
      confirmed: false,
    });
    await createAuthUser({
      id: crypto.randomUUID(),
      email: CONFIRMED_EMAIL,
      password: PASSWORD,
      confirmed: true,
    });

    const unconfirmed = await resendVerification(anonClient(), { email: UNCONFIRMED_EMAIL });
    // An already-confirmed address has nothing to resend — Supabase errors
    // internally, but the flow must still report the generic success.
    const confirmed = await resendVerification(anonClient(), { email: CONFIRMED_EMAIL });
    const unknown = await resendVerification(anonClient(), {
      email: `nobody-${crypto.randomUUID()}@template.test`,
    });

    // Byte-for-byte identical results — indistinguishable to the caller.
    expect(unconfirmed).toEqual(confirmed);
    expect(confirmed).toEqual(unknown);
    expect(unconfirmed.ok).toBe(true);
    if (!unconfirmed.ok) return;
    expect(unconfirmed.data.message).toMatch(/if that account exists/i);
  });

  itLive('returns the generic response for a malformed address (no validation-error leak)', async () => {
    const result = await resendVerification(anonClient(), { email: 'not-an-email' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.message).toMatch(/if that account exists/i);
  });
});
