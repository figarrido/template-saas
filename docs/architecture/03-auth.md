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
