# Auth

## Authentication

**Decision:** Supabase Auth for end users. `apps/admin` uses Supabase Auth with a separate `is_admin` claim/role check enforced both at RLS and at the Next.js middleware layer.

**Why:**
- Reuses Supabase; no second auth provider.
- Admin role lives in a separate `admin_users` table (not just a column on `users`) so the admin grant is auditable.

**Deployment:**
- Admin app lives on a dedicated subdomain (e.g., `admin.example.com`), separate Vercel project. See [01-stack](./01-stack.md).

**Access enforcement (app-layer, ships in template):**
- Next.js middleware in `apps/admin` enforces, in order: (1) authenticated session, (2) `admin_users` row exists for the user (an **Operator** — a User with backoffice access, tracked separately from org memberships), (3) MFA factor present and verified within the session lifetime. Any failure → 404 (not 403 — admin existence shouldn't be discoverable).
- `apps/admin` always uses the service-role Supabase client server-side for cross-org queries; never the user's JWT. This is the single legitimate place service-role appears outside of the worker services.
- Audit log: every state-changing admin action writes to an append-only `admin_audit_log` table (actor, target, action, before/after diff, timestamp, IP).

**Edge controls (vendor-specific, NOT in template — recipes only):**
- [recipes/admin-edge-access.md](../recipes/admin-edge-access.md) covers Cloudflare Access (recommended for most teams), Vercel Deployment Protection (simplest for Vercel-only orgs), and IP allowlist via middleware (static-IP/VPN setups).

**Tradeoffs:**
- Admin app shares the auth provider with the client app — a compromised Supabase project compromises both. Mitigation: hardware-key MFA in middleware + edge controls per the recipes.
- Subdomain isolation gives cookie-scope separation and lets edge controls be added without code changes.
- 404 (instead of 403) for missing-admin status leaks slightly less but breaks "helpful error message" UX. Accepted — wrong audience for friendly errors.

**Related:** [01-stack](./01-stack.md), [02-data](./02-data.md), [09-api-boundary](./09-api-boundary.md), [10-feature-flags](./10-feature-flags.md)

---

## OAuth providers

**Decision:** **Email/password only by default.** OAuth providers (Google, GitHub, Apple) are wired as configuration in `packages/auth` but not enabled.

**Mechanics:**
- `packages/auth` exports a `providers` array; the template ships with `['email']`.
- Enabling `'google'` is: (1) register OAuth credentials in Supabase dashboard, (2) add env vars, (3) flip the array.
- README's onboarding section documents the one-screen setup for Google, GitHub, and Apple.

**Why:**
- Supabase requires the project owner to register OAuth credentials with each provider. Defaulting OAuth on means the template ships broken until those keys are added — worse DX than enabling later.
- Email/password works out of the box, including the `pnpm setup` + InBucket dev flow (see [12-local-dev](./12-local-dev.md)).

**Tradeoffs:**
- "Modern SaaS expects Google sign-in on day one." Users have to flip a flag. Accepted; the README calls it out, and the wiring is one config change, not a refactor.

**Related:** [07-frontend](./07-frontend.md)

---

## End-user authentication flows (`apps/web`)

**Decision:** Ship the full end-user credential surface in `apps/web`: **sign-up, sign-in, sign-out, forgot-password, reset-password, change-password, change-email, email-verification + resend**, plus the first-login routing redirect. All of `apps/admin` auth (Operator sign-in + the mandatory-MFA enrollment/challenge/recovery-codes stack) is a **separate follow-up build** — admin sign-in is inseparable from the MFA gate, so they ship together, not here. Also deferred: end-user MFA, self-serve account deletion (a [recipe](../recipes/) — touches the GDPR non-goal), an active-sessions list, CAPTCHA on sign-up (a hardening recipe), and invite-aware sign-up (invitation acceptance is its own flow — see below).

### Execution model

- **Server Actions** for every credential submit (sign-up, sign-in, request-reset, set-new-password, change-password, change-email), grouped in `apps/web/lib/actions/auth.ts`. Matches [09-api-boundary](./09-api-boundary.md).
- **Two Route Handlers** for the redirect *landings*, which are GET navigations and so cannot be Server Actions:
  - `/auth/confirm` — verifies the one-time `token_hash` from verification / recovery / email-change emails via `verifyOtp`.
  - `/auth/callback` — exchanges the OAuth PKCE `code` via `exchangeCodeForSession`. Ships now, dormant until a provider is enabled.
- Email links therefore use the **`{{ .TokenHash }}`** template style pointing at `/auth/confirm`, not the legacy hosted `/auth/v1/verify` URL.
- The SSR session is cookie-backed via `@supabase/ssr`; the cookie-adapter glue extends `packages/db`'s `getUserClient`. Shared Zod schemas + the password-policy constants live in `packages/auth` (single source the future admin build reuses).

### Verification & enumeration

- **Email verification is required before first sign-in** (`[auth.email] enable_confirmations` ON). Sign-up lands on a "check your email" interstitial; an unconfirmed sign-in is blocked with an inline resend affordance. Verified-email is then an invariant the rest of the app may assume.
- **Account-enumeration posture is privacy-preserving with one deliberate exception** — see [ADR 0002](../adr/0002-account-enumeration-posture.md). Sign-up and forgot-password are always generic; sign-in reveals "email not confirmed" only after a *correct* password.

### Password policy

- **Length-first, NIST-aligned:** minimum length **10**, no composition rules, Supabase **leaked-password protection (HaveIBeenPwned)** ON. The shared Zod schema mirrors the length so client and Server Action agree; HIBP is enforced server-side by Supabase and surfaced as a flow error. Length is a one-line knob derived projects can raise.

### Sessions

- **Persistent sessions, no remember-me toggle.** `@supabase/ssr` cookies with auto-refresh (short access token + rotating refresh token).
- **Sign-out uses `scope: 'local'`** (this device only), so signing out on one device doesn't kill the User's others.
- **Password reset revokes all *other* sessions** ("revoke other sessions on password change"), since reset is the account-recovery path.

### Sensitive changes (re-auth)

- **Change-password and change-email both require the current password**, verified by a silent `signInWithPassword` before `updateUser` — see [ADR 0003](../adr/0003-reauth-for-sensitive-account-changes.md). Email change uses Supabase's secure double-confirm; the new address is inactive until confirmed via `/auth/confirm?type=email_change`.

### OAuth seam ("open to social later")

- The `PROVIDERS` array + `enabledProviders()` in `packages/auth` **is** the seam. Sign-in/sign-up pages render one button per enabled provider (today: none → pure email/password). Initiation is a small Server Action calling `signInWithOAuth({ provider, options.redirectTo: '/auth/callback' })`.
- Adding a provider later = flip `enabled: true` + add env vars + register credentials in Supabase. **No flow rework.**
- **Identity linking is automatic on verified-email match** — see [ADR 0004](../adr/0004-auto-link-identities-on-verified-email.md). The manual link/unlink settings UI is deferred.

### Auth email delivery

- Verification / recovery / email-change emails are sent via a Supabase **send-email Auth hook → React Email** (`packages/email`), Resend (prod) / InBucket (dev) — see [ADR 0005](../adr/0005-auth-emails-via-send-email-hook.md).

**Why:**
- The credential flows are the most-reskinned but least-rearchitected part of every derived project; shipping the bones (execution model, policies, OAuth seam) saves the re-architecture while leaving styling free.
- The OAuth seam is wired-but-dormant so "add Google sign-in" is config, not a refactor — consistent with the email/password-only default above.

**Tradeoffs:**
- The wired flows + the send-email hook are weight every derived project carries even when they restyle. Accepted for the re-architecture they save.
- The enumeration exception, the re-auth gate, the auto-link policy, and the email hook each deviate from a Supabase default; the ADRs record why so they aren't "fixed" back.

**Related:** [02-data](./02-data.md), [07-frontend](./07-frontend.md), [09-api-boundary](./09-api-boundary.md), [ADR 0002](../adr/0002-account-enumeration-posture.md), [ADR 0003](../adr/0003-reauth-for-sensitive-account-changes.md), [ADR 0004](../adr/0004-auto-link-identities-on-verified-email.md), [ADR 0005](../adr/0005-auth-emails-via-send-email-hook.md)

---

## Onboarding & invitation flows

**Decision:** Ship wired flows. `profiles` table 1:1 with `auth.users`. Multi-org with login-time picker. Signed-token email invites. Role enum (`owner` / `manager` / `member`) with a central `can(membership, action)` helper.

### Data model

- **`profiles`** — PK `user_id` (FK to `auth.users.id`, `ON DELETE CASCADE`). Holds `display_name`, `avatar_url`, `locale`, `timezone`, marketing prefs. Created by a `handle_new_user()` trigger on `auth.users` insert (Supabase's standard pattern — we don't own the `auth` schema).
- **`memberships`** — surrogate `membership_id` PK + unique `(user_id, organization_id)`. `role` column constrained to `owner` / `manager` / `member` via enum or check constraint. (The role formerly named `admin` is `manager` — see [ADR 0001](../adr/0001-rename-admin-role-to-manager.md) — to avoid collision with `apps/admin` and `admin_users`.)
- **`invitations`** — `invitation_id, organization_id, email, role, token_hash, expires_at, accepted_at, invited_by`. 7-day TTL default.

### Flows

- **Signup:** email/password → email verification (Supabase-managed) → first login → check membership count.
- **First-login routing:** 0 orgs → "create your first org" screen; 1 org → redirect to that org's dashboard; 2+ orgs → org picker.
- **Invite acceptance:** signed token link → if user exists, login + auto-accept; if not, signup + email-verify + auto-accept. Skips "create your first org" because the user now has one.
- **Active org state:** `active_organization_id` cookie. Middleware in `apps/web` validates the cookie against memberships on every request; mismatch → org picker. RLS still keys on `auth.uid()` + `memberships` (cookie is UI scope, not a security boundary).
- **Org switcher** in the top nav updates the cookie + soft-reload.

### Organization creation & slug derivation

**Decision:** Organizations are created only through the `create_organization` `SECURITY DEFINER` RPC (authenticated-only; execute revoked from anon/public), which inserts the Organization and the creator's `owner` Membership in one transaction. The URL Slug is derived in SQL: lowercase-kebab of the name, 2–50 char bounds, reserved app-path-segment remapping and collision resolution by suffixing — atomic with the `unique(slug)` constraint. Creation never rejects a name for slug reasons. No per-user cap on Organizations; IP rate-limiting (middleware) is the only throttle — per-user caps are derived-project policy.

**Why:** One write door keeps the `organizations` insert-blocking RLS policy absolute and makes org+owner atomicity a DB invariant, not app discipline. Slug logic in one place (SQL) means no client/server drift and no name ever fails for reasons the User can't see (Slug is invisible to them). Atomic suffix-on-`unique_violation` is race-safe under concurrent creates.

**Tradeoffs:** Slug logic in PL/pgSQL is less ergonomic to unit-test than TypeScript, but it has exactly one home and is covered by the RLS suite through real DB behavior. No-cap keeps onboarding frictionless; abuse is bounded by rate limits and is a derived-project concern.

**Related:** [02-data](./02-data.md), [09-api-boundary](./09-api-boundary.md)

### Authorization helper (`packages/auth`)

- `can(membership, action)` — central lookup table mapping (role, action) → allow/deny.
- Action set is extensible per derived project; the role enum rarely needs extension.
- Reused by middleware, Server Actions, and Route Handlers so the auth decision is in one place.

### Not in scope

- Auto-join-by-email-domain at template level — security footgun by default. Recipe in [recipes/email-domain-orgs.md](../recipes/email-domain-orgs.md) for derived projects that want it.

**Why:**
- Onboarding is the single most-modified flow in every derived project, but the *bones* (profile trigger, org creation, invite token shape, email template) are identical. Save derived projects from re-architecting.
- `profiles` separate from `auth.users` is Supabase's recommended pattern.
- Multi-org from day one is far cheaper than retrofitting. Single-org assumptions leak into RLS policies, URL structures, and UI state.

**Tradeoffs:**
- Wired flows are weight every derived project carries even if they restyle. Cost is a 1-2 day re-skin; benefit is they don't re-architect.
- Cookie-based active org adds a middleware hop on every request. Cheap; revisit if it shows in profiles.
- Three roles cover ~80% of products. Apps needing finer-grained permissions (per-resource, custom roles) layer it on top of `can()`.

**Related:** [02-data](./02-data.md), [07-frontend](./07-frontend.md)
