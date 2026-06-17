// Auth providers wired but disabled by default.
//
// docs/architecture/03-auth.md: "Supabase Auth, email/password only by
// default. OAuth wired but disabled." Flipping a provider on means
// enabling it in supabase/config.toml AND populating the matching env
// vars in packages/env. The configs below are the single source of truth
// for which providers exist.

export type OAuthProvider = 'google' | 'github' | 'apple' | 'azure';

export type OAuthProviderConfig = {
  /** Provider name as Supabase Auth knows it. */
  provider: OAuthProvider;
  /** True = configured + ready. False = wired but disabled. */
  enabled: boolean;
  /** Env var names the provider needs to be flipped on. */
  envVars: string[];
};

export const PROVIDERS: ReadonlyArray<OAuthProviderConfig> = [
  {
    provider: 'google',
    enabled: false,
    envVars: ['SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID', 'SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET'],
  },
  {
    provider: 'github',
    enabled: false,
    envVars: ['SUPABASE_AUTH_EXTERNAL_GITHUB_CLIENT_ID', 'SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET'],
  },
  {
    provider: 'apple',
    enabled: false,
    envVars: ['SUPABASE_AUTH_EXTERNAL_APPLE_CLIENT_ID', 'SUPABASE_AUTH_EXTERNAL_APPLE_SECRET'],
  },
  {
    provider: 'azure',
    enabled: false,
    envVars: ['SUPABASE_AUTH_EXTERNAL_AZURE_CLIENT_ID', 'SUPABASE_AUTH_EXTERNAL_AZURE_SECRET'],
  },
];

export function enabledProviders(): OAuthProviderConfig[] {
  return PROVIDERS.filter((p) => p.enabled);
}
