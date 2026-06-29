import { describe, expect, it } from 'vitest';
import type { AuthClient } from '../src/flows/types.js';
import { signIn } from '../src/flows/sign-in.js';
import { signOut } from '../src/flows/sign-out.js';
import { signUp } from '../src/flows/sign-up.js';
import { resendVerification } from '../src/flows/resend-verification.js';
import { requestPasswordReset } from '../src/flows/request-password-reset.js';
import { updatePassword } from '../src/flows/update-password.js';
import { verifyEmailToken, isEmailOtpType } from '../src/flows/verify-email.js';

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
  signUp?: (args: {
    email: string;
    password: string;
    options?: { emailRedirectTo?: string };
  }) => Promise<unknown>;
  verifyOtp?: (args: { type: string; token_hash: string }) => Promise<unknown>;
  resetPasswordForEmail?: (
    email: string,
    options?: { redirectTo?: string },
  ) => Promise<unknown>;
  updateUser?: (args: { password?: string }) => Promise<unknown>;
  getSession?: () => Promise<{ data: { session: unknown }; error: unknown }>;
}): AuthClient {
  return {
    auth: {
      signInWithPassword:
        opts.signInWithPassword ?? (async () => ({ data: { user: null, session: null }, error: null })),
      signOut: opts.signOut ?? (async () => ({ error: null })),
      resend: opts.resend ?? (async () => ({})),
      signUp: opts.signUp ?? (async () => ({ data: { user: null, session: null }, error: null })),
      verifyOtp: opts.verifyOtp ?? (async () => ({ data: { user: null, session: null }, error: null })),
      resetPasswordForEmail: opts.resetPasswordForEmail ?? (async () => ({ data: {}, error: null })),
      updateUser: opts.updateUser ?? (async () => ({ data: { user: { id: 'u' } }, error: null })),
      getSession:
        opts.getSession ??
        (async () => ({ data: { session: { access_token: 't' } }, error: null })),
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

describe('signUp flow', () => {
  const PASSWORD = 'correct-horse-battery-staple';
  const EMAIL = 'new@example.com';

  it('returns the generic "check your email" success on a fresh signup', async () => {
    const client = fakeClient({
      signUp: async () =>
        ({
          data: {
            user: {
              id: 'user-1',
              email: EMAIL,
              identities: [{ id: 'identity-1', identity_id: 'identity-1' }],
            },
            session: null,
          },
          error: null,
        }),
    });
    const result = await signUp(client, { email: EMAIL, password: PASSWORD });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.message).toMatch(/check your email/i);
  });

  it('returns the SAME generic response when the email is already registered (no enumeration leak)', async () => {
    // Supabase signals "already registered" by returning a user with no
    // identities and session: null. ADR-0002: the flow must NOT surface
    // this — same shape as the success case.
    const client = fakeClient({
      signUp: async () =>
        ({
          data: {
            user: { id: 'obfuscated', email: EMAIL, identities: [] },
            session: null,
          },
          error: null,
        }),
    });
    const fresh = await signUp(client, { email: EMAIL, password: PASSWORD });
    const duplicate = await signUp(client, { email: EMAIL, password: PASSWORD });
    expect(duplicate).toEqual(fresh);
    if (!duplicate.ok) return;
    expect(duplicate.data.message).toMatch(/check your email/i);
  });

  it('forwards an emailRedirectTo option to supabase-js', async () => {
    let received: { emailRedirectTo?: string } | undefined;
    const client = fakeClient({
      signUp: async (args) => {
        received = args.options;
        return {
          data: { user: { id: 'u', email: EMAIL, identities: [{ id: 'i' }] }, session: null },
          error: null,
        };
      },
    });
    await signUp(client, { email: EMAIL, password: PASSWORD }, { emailRedirectTo: 'https://x.test/cb' });
    expect(received).toEqual({ emailRedirectTo: 'https://x.test/cb' });
  });

  it('rejects too-short passwords client-side with invalid-input', async () => {
    const result = await signUp(fakeClient({}), { email: EMAIL, password: 'short' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('invalid-input');
  });

  it('rejects malformed emails client-side with invalid-input', async () => {
    const result = await signUp(fakeClient({}), { email: 'not-an-email', password: PASSWORD });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('invalid-input');
  });

  it('surfaces Supabase weak_password (HIBP) as a clear invalid-input error', async () => {
    const client = fakeClient({
      signUp: async () =>
        ({
          data: { user: null, session: null },
          error: {
            code: 'weak_password',
            message: 'Password has been found in breach databases.',
          },
        }),
    });
    const result = await signUp(client, { email: EMAIL, password: PASSWORD });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('invalid-input');
    expect(result.error).toMatch(/password/i);
  });

  it('does NOT return a Session even on success (verification gate)', async () => {
    const client = fakeClient({
      signUp: async () =>
        ({
          data: {
            user: { id: 'u', email: EMAIL, identities: [{ id: 'i' }] },
            session: { access_token: 'should-be-ignored' },
          },
          error: null,
        }),
    });
    const result = await signUp(client, { email: EMAIL, password: PASSWORD });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Result shape carries only the generic message — no session, no user id.
    expect(Object.keys(result.data)).toEqual(['message']);
  });

  it('maps an unexpected error code to the unexpected branch', async () => {
    const client = fakeClient({
      signUp: async () =>
        ({
          data: { user: null, session: null },
          error: { code: 'over_request_rate_limit', message: 'too many' },
        }),
    });
    const result = await signUp(client, { email: EMAIL, password: PASSWORD });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('unexpected');
  });
});

describe('verifyEmailToken flow', () => {
  it('returns ok with the userId when verifyOtp succeeds', async () => {
    let received: { type: string; token_hash: string } | undefined;
    const client = fakeClient({
      verifyOtp: async (args) => {
        received = args;
        return { data: { user: { id: 'user-1' }, session: { access_token: 't' } }, error: null };
      },
    });
    const result = await verifyEmailToken(client, { tokenHash: 'hash-1', type: 'signup' });
    expect(result).toEqual({ ok: true, data: { userId: 'user-1' } });
    expect(received).toEqual({ type: 'signup', token_hash: 'hash-1' });
  });

  it('returns the generic "no longer valid" error when verifyOtp fails', async () => {
    const client = fakeClient({
      verifyOtp: async () => ({ data: { user: null, session: null }, error: { message: 'expired' } }),
    });
    const result = await verifyEmailToken(client, { tokenHash: 'hash-1', type: 'signup' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/no longer valid/i);
  });

  it('rejects an empty token_hash without hitting Supabase', async () => {
    let calls = 0;
    const client = fakeClient({
      verifyOtp: async () => {
        calls++;
        return { data: { user: { id: 'u' }, session: null }, error: null };
      },
    });
    const result = await verifyEmailToken(client, { tokenHash: '', type: 'signup' });
    expect(result.ok).toBe(false);
    expect(calls).toBe(0);
  });

  it('isEmailOtpType accepts known types and rejects everything else', () => {
    expect(isEmailOtpType('signup')).toBe(true);
    expect(isEmailOtpType('recovery')).toBe(true);
    expect(isEmailOtpType('email_change')).toBe(true);
    expect(isEmailOtpType('not-a-real-type')).toBe(false);
    expect(isEmailOtpType(undefined)).toBe(false);
  });
});

describe('requestPasswordReset flow', () => {
  it('returns the generic "if an account exists..." message and forwards the email to Supabase', async () => {
    const calls: Array<{ email: string; options?: { redirectTo?: string } }> = [];
    const client = fakeClient({
      resetPasswordForEmail: async (email, options) => {
        calls.push({ email, options });
        return { data: {}, error: null };
      },
    });

    const result = await requestPasswordReset(client, { email: 'someone@example.com' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.message).toMatch(/if an account exists/i);
    expect(calls).toEqual([{ email: 'someone@example.com', options: undefined }]);
  });

  it('forwards the redirectTo option so the recovery link lands on /auth/confirm', async () => {
    let received: { redirectTo?: string } | undefined;
    const client = fakeClient({
      resetPasswordForEmail: async (_email, options) => {
        received = options;
        return { data: {}, error: null };
      },
    });

    await requestPasswordReset(
      client,
      { email: 'someone@example.com' },
      { redirectTo: 'https://x.test/auth/confirm' },
    );

    expect(received).toEqual({ redirectTo: 'https://x.test/auth/confirm' });
  });

  it('returns the SAME generic shape when the email is malformed (no validation-error leak)', async () => {
    const calls: Array<unknown> = [];
    const client = fakeClient({
      resetPasswordForEmail: async (email, options) => {
        calls.push({ email, options });
        return { data: {}, error: null };
      },
    });

    const result = await requestPasswordReset(client, { email: 'not-an-email' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.message).toMatch(/if an account exists/i);
    // Malformed input is dropped on the floor — never hits Supabase.
    expect(calls).toHaveLength(0);
  });

  it('still returns the generic shape when Supabase returns an error (no enumeration via failure)', async () => {
    const client = fakeClient({
      resetPasswordForEmail: async () => ({ data: null, error: { message: 'rate limit' } }),
    });

    const result = await requestPasswordReset(client, { email: 'someone@example.com' });
    expect(result.ok).toBe(true);
  });
});

describe('updatePassword flow', () => {
  const NEW_PASSWORD = 'fresh-horse-battery-staple';

  it('updates the password, revokes other Sessions, and keeps the current device signed in', async () => {
    const calls: Array<{ fn: string; args: unknown }> = [];
    const client = fakeClient({
      getSession: async () => ({
        data: { session: { access_token: 'recovery-jwt' } },
        error: null,
      }),
      updateUser: async (args) => {
        calls.push({ fn: 'updateUser', args });
        return { data: { user: { id: 'user-1' } }, error: null };
      },
      signOut: async (args) => {
        calls.push({ fn: 'signOut', args });
        return { error: null };
      },
    });

    const result = await updatePassword(client, { password: NEW_PASSWORD });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.message).toMatch(/updated/i);
    expect(calls).toEqual([
      { fn: 'updateUser', args: { password: NEW_PASSWORD } },
      { fn: 'signOut', args: { scope: 'others' } },
    ]);
  });

  it('rejects too-short passwords with invalid-input (shared policy with sign-up)', async () => {
    let updateCalls = 0;
    const client = fakeClient({
      updateUser: async () => {
        updateCalls++;
        return { data: { user: { id: 'u' } }, error: null };
      },
    });
    const result = await updatePassword(client, { password: 'short' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('invalid-input');
    expect(updateCalls).toBe(0);
  });

  it('rejects the call (without revoking) when no Session is present — link expired or never landed', async () => {
    let signOutCalls = 0;
    const client = fakeClient({
      getSession: async () => ({ data: { session: null }, error: null }),
      signOut: async () => {
        signOutCalls++;
        return { error: null };
      },
    });
    const result = await updatePassword(client, { password: NEW_PASSWORD });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('invalid-credentials');
    expect(result.error).toMatch(/no longer valid/i);
    expect(signOutCalls).toBe(0);
  });

  it('surfaces Supabase weak_password (HIBP) as a clear invalid-input error', async () => {
    const client = fakeClient({
      updateUser: async () => ({
        data: { user: null },
        error: {
          code: 'weak_password',
          message: 'Password has been found in breach databases.',
        },
      }),
    });
    const result = await updatePassword(client, { password: NEW_PASSWORD });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('invalid-input');
    expect(result.error).toMatch(/password/i);
  });

  it('maps an AuthSessionMissingError from updateUser to the recovery-session-missing branch', async () => {
    const client = fakeClient({
      updateUser: async () => ({
        data: { user: null },
        error: { name: 'AuthSessionMissingError', message: 'Auth session missing!' },
      }),
    });
    const result = await updatePassword(client, { password: NEW_PASSWORD });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('invalid-credentials');
    expect(result.error).toMatch(/no longer valid/i);
  });

  it('maps an unexpected updateUser error to the unexpected branch', async () => {
    const client = fakeClient({
      updateUser: async () => ({
        data: { user: null },
        error: { code: 'over_request_rate_limit', message: 'too many' },
      }),
    });
    const result = await updatePassword(client, { password: NEW_PASSWORD });
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
