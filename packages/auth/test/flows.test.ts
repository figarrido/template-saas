import { describe, expect, it } from 'vitest';
import type { AuthClient } from '../src/flows/types.js';
import { signIn } from '../src/flows/sign-in.js';
import { signOut } from '../src/flows/sign-out.js';
import { resendVerification } from '../src/flows/resend-verification.js';

// Unit tests with a fake supabase client. The full round-trip against local
// Supabase lives in test/integration/sign-in.integration.test.ts; here we
// pin the ADR-0002 mapping deterministically.

// The flows only touch `auth.signInWithPassword`, `auth.signOut`, and
// `auth.resend`. We fake them with structurally-compatible shapes — typed
// loosely through `unknown` because the full SupabaseClient surface area is
// huge and we don't depend on the rest.
function fakeClient(opts: {
  signInWithPassword?: (args: { email: string; password: string }) => Promise<unknown>;
  signOut?: (args?: { scope?: 'local' | 'global' | 'others' }) => Promise<{ error: unknown }>;
  resend?: (args: { type: string; email: string }) => Promise<unknown>;
}): AuthClient {
  return {
    auth: {
      signInWithPassword:
        opts.signInWithPassword ?? (async () => ({ data: { user: null, session: null }, error: null })),
      signOut: opts.signOut ?? (async () => ({ error: null })),
      resend: opts.resend ?? (async () => ({})),
    },
  } as unknown as AuthClient;
}

describe('signIn flow', () => {
  it('returns ok with the userId on a successful sign-in', async () => {
    const client = fakeClient({
      signInWithPassword: async () =>
        ({ data: { user: { id: 'user-1' }, session: { access_token: 't' } }, error: null }),
    });
    const result = await signIn(client, { email: 'a@b.co', password: 'whatever' });
    expect(result).toEqual({ ok: true, data: { userId: 'user-1' } });
  });

  it('returns the generic "invalid email or password" error for wrong-password', async () => {
    const client = fakeClient({
      signInWithPassword: async () =>
        ({ data: { user: null, session: null }, error: { code: 'invalid_credentials', message: 'Invalid login' } }),
    });
    const result = await signIn(client, { email: 'a@b.co', password: 'whatever' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('invalid-credentials');
    expect(result.error).toBe('Invalid email or password.');
  });

  it('returns the generic error for unknown emails (no enumeration leak)', async () => {
    const client = fakeClient({
      signInWithPassword: async () =>
        ({ data: { user: null, session: null }, error: { code: 'invalid_credentials', message: 'no user' } }),
    });
    const result = await signIn(client, { email: 'nobody@example.com', password: 'whatever' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('invalid-credentials');
  });

  it('surfaces "email not confirmed" when Supabase signals that branch (correct password + unconfirmed)', async () => {
    const client = fakeClient({
      signInWithPassword: async () =>
        ({ data: { user: null, session: null }, error: { code: 'email_not_confirmed', message: 'Email not confirmed' } }),
    });
    const result = await signIn(client, { email: 'pending@example.com', password: 'whatever' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('not-confirmed');
    expect(result.error).toMatch(/not confirmed/i);
  });

  it('falls back to the message regex when supabase-js does not populate `code`', async () => {
    const client = fakeClient({
      signInWithPassword: async () =>
        ({ data: { user: null, session: null }, error: { message: 'Email not confirmed' } }),
    });
    const result = await signIn(client, { email: 'pending@example.com', password: 'whatever' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('not-confirmed');
  });

  it('rejects malformed input with the generic invalid-input mapping', async () => {
    const result = await signIn(fakeClient({}), { email: 'not-an-email', password: '' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('invalid-input');
  });
});

describe('signOut flow', () => {
  it('passes scope: "local" so other devices stay signed in', async () => {
    let receivedScope: string | undefined;
    const client = fakeClient({
      signOut: async (args) => {
        receivedScope = args?.scope;
        return { error: null };
      },
    });
    const result = await signOut(client);
    expect(result).toEqual({ ok: true, data: undefined });
    expect(receivedScope).toBe('local');
  });

  it('returns a generic error if the underlying signOut fails', async () => {
    const client = fakeClient({
      signOut: async () => ({ error: { message: 'boom' } }),
    });
    const result = await signOut(client);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('unexpected');
  });
});

describe('resendVerification flow', () => {
  it('returns the generic "if that account exists..." message regardless of input', async () => {
    const calls: Array<{ type: string; email: string }> = [];
    const client = fakeClient({
      resend: async (args) => {
        calls.push(args);
        return {};
      },
    });
    const result = await resendVerification(client, { email: 'a@b.co' });
    expect(result.ok).toBe(true);
    expect(calls).toEqual([{ type: 'signup', email: 'a@b.co' }]);
  });

  it('still returns the generic message when the email is malformed (no enumeration via validation error)', async () => {
    const calls: Array<unknown> = [];
    const client = fakeClient({
      resend: async (args) => {
        calls.push(args);
        return {};
      },
    });
    const result = await resendVerification(client, { email: 'not-an-email' });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(0);
  });
});
