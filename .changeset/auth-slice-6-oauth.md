---
'@template/auth': minor
---

Auth slice 6 — OAuth sign-in seam (wired, dormant; auto-link).

- Add `signInOAuth(client, { provider, redirectTo })` flow function that
  wraps `signInWithPassword`'s OAuth sibling and returns the provider's
  authorization URL for the caller to redirect to.
- Add `exchangeOAuthCode(client, code)` flow function for the
  `/auth/callback` Route Handler to exchange the PKCE code via
  `exchangeCodeForSession`.
- Add `oauthSignInButtons(providers?)` UI helper that filters the
  `PROVIDERS` array to the enabled entries and pairs each with a
  user-facing label. Default `providers` is the module-level `PROVIDERS`
  — returns `[]` while all providers are disabled so the sign-in/sign-up
  pages render no OAuth buttons.

Identity auto-linking on a provider-verified-email match relies on the
Supabase default — ADR 0004; no manual link/unlink UI ships.

Enabling a provider in a derived project is config only: flip
`enabled: true` in `PROVIDERS`, populate the env vars, and flip
`enabled = true` on the matching `[auth.external.<provider>]` block in
`supabase/config.toml` (all four — apple, azure, github, google — ship
wired but disabled, with `client_id` and `secret` already routed through
the env vars `PROVIDERS` declares). No flow rework, no toml block to
hand-author. A drift test in `packages/auth` pins the alignment so
`PROVIDERS` and `supabase/config.toml` can't silently diverge.
