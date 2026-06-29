import { describe, expect, it } from 'vitest';
import type { AuthClient } from '../src/flows/types.js';
import { signInOAuth } from '../src/flows/sign-in-oauth.js';
import { exchangeOAuthCode } from '../src/flows/exchange-oauth-code.js';
import {
  enabledProviders,
  oauthSignInButtons,
  PROVIDERS,
  type OAuthProviderConfig,
} from '../src/providers.js';

// Issue #8 — OAuth seam. The flow functions take an injected Supabase client
// so the Server Action layer in apps/web stays a thin adapter and the same
// logic is unit-testable here. The seam ships wired but dormant: with no
// provider flipped on, `enabledProviders()` returns [] and the UI renders
// nothing OAuth-related (acceptance criterion #1).

function fakeClient(opts: {
  signInWithOAuth?: (args: {
    provider: string;
    options?: { redirectTo?: string };
  }) => Promise<unknown>;
  exchangeCodeForSession?: (code: string) => Promise<unknown>;
}): AuthClient {
  return {
    auth: {
      signInWithOAuth:
        opts.signInWithOAuth ??
        (async () => ({ data: { provider: 'google', url: null }, error: null })),
      exchangeCodeForSession:
        opts.exchangeCodeForSession ??
        (async () => ({ data: { user: null, session: null }, error: null })),
    },
  } as unknown as AuthClient;
}

describe('enabledProviders (seam)', () => {
  it('returns [] by default so the sign-in/sign-up pages render no OAuth buttons', () => {
    expect(enabledProviders()).toEqual([]);
  });

  it('returns only the providers flipped on in PROVIDERS', () => {
    // The default config has every provider disabled. We snapshot here to pin
    // the contract; a derived project flips `enabled: true` in PROVIDERS to
    // turn one on without any flow rework.
    expect(PROVIDERS.every((p) => p.enabled === false)).toBe(true);
  });
});

describe('oauthSignInButtons (UI seam)', () => {
  it('renders nothing while all providers are disabled (default)', () => {
    expect(oauthSignInButtons()).toEqual([]);
  });

  it('renders a labelled button for each enabled provider', () => {
    // Issue #8 acceptance criterion: "With a provider enabled in config, a
    // button for it renders." Driven with an injected configs array so the
    // test does not have to mutate the module-level PROVIDERS.
    const configs: OAuthProviderConfig[] = [
      { provider: 'google', enabled: true, envVars: [] },
      { provider: 'github', enabled: false, envVars: [] },
    ];
    expect(oauthSignInButtons(configs)).toEqual([
      { provider: 'google', label: 'Continue with Google' },
    ]);
  });
});

describe('signInOAuth flow', () => {
  it('initiates the provider hand-off with redirectTo pointing at /auth/callback', async () => {
    let received: { provider: string; options?: { redirectTo?: string } } | undefined;
    const client = fakeClient({
      signInWithOAuth: async (args) => {
        received = args;
        return {
          data: { provider: args.provider, url: 'https://accounts.google.com/o/oauth2/v2/auth?x=1' },
          error: null,
        };
      },
    });
    const result = await signInOAuth(client, {
      provider: 'google',
      redirectTo: 'https://app.example.com/auth/callback',
    });
    expect(received?.provider).toBe('google');
    expect(received?.options?.redirectTo).toBe('https://app.example.com/auth/callback');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.url).toMatch(/^https:\/\/accounts\.google\.com\//);
  });

  it('returns invalid-input for an unknown provider name', async () => {
    const result = await signInOAuth(fakeClient({}), {
      // @ts-expect-error — exercising the runtime guard
      provider: 'not-a-provider',
      redirectTo: 'https://app.example.com/auth/callback',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('invalid-input');
  });

  it('returns an unexpected error if Supabase signals failure', async () => {
    const client = fakeClient({
      signInWithOAuth: async () => ({
        data: { provider: 'google', url: null },
        error: { message: 'provider misconfigured' },
      }),
    });
    const result = await signInOAuth(client, {
      provider: 'google',
      redirectTo: 'https://app.example.com/auth/callback',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('unexpected');
  });
});

describe('exchangeOAuthCode flow', () => {
  it('exchanges the PKCE code via exchangeCodeForSession and returns the User id', async () => {
    let receivedCode: string | undefined;
    const client = fakeClient({
      exchangeCodeForSession: async (code) => {
        receivedCode = code;
        return {
          data: { user: { id: 'user-42' }, session: { access_token: 't' } },
          error: null,
        };
      },
    });
    const result = await exchangeOAuthCode(client, 'pkce-code-from-provider');
    expect(receivedCode).toBe('pkce-code-from-provider');
    expect(result).toEqual({ ok: true, data: { userId: 'user-42' } });
  });

  it('returns the generic invalid-credentials error if Supabase rejects the code', async () => {
    const client = fakeClient({
      exchangeCodeForSession: async () => ({
        data: { user: null, session: null },
        error: { message: 'invalid grant' },
      }),
    });
    const result = await exchangeOAuthCode(client, 'expired-or-tampered');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('invalid-credentials');
  });

  it('returns invalid-input when the code is missing or empty', async () => {
    const result = await exchangeOAuthCode(fakeClient({}), '');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('invalid-input');
  });
});
