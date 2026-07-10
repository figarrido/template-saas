# Operator access: invitation-based, flat, MFA-gated

`apps/admin` is **invitation-only** — no open sign-up. An existing Operator invites another by **email**; accepting the invitation **provisions a User** if none exists for that address (setting a password), records the `admin_users` grant, and forces MFA enrollment before the new Operator can do anything else. This deliberately **reverses** the `admin_users` rule that grants are *"granted exclusively via service role / DB-side process — never self-service"*: Operator-to-Operator onboarding is the entire point, and the alternative — making internal staff first create a **public end-user account** on `apps/web` before they can be made an Operator — is backwards, since an Operator *"may or may not hold a Membership in any Organization"* (`CONTEXT.md`). Invitation-gated provisioning is not the open sign-up we rejected; the token, emailed to the address, both authorizes the account and proves control of the mailbox.

All Operators are **flat-equal** — there is no tier column on `admin_users`. Any Operator can invite and revoke peers, reset a peer's MFA factor, list Organizations, and grant [Comps](0007-entitlements-temporal-ledger.md). The blast radius of a single compromised Operator (minting Operators, handing out Comps) is accepted because the Operator set is small (`docs/constraints/team.md`), every Operator is behind mandatory MFA, and every mutation is written to `admin_audit_log`. Tiering is a clean later addition — a role column plus a `canOperator(operator, action)` table mirroring the org-level `can()` in `packages/auth`.

Access requires **`aal2`**, satisfied by **Supabase-native TOTP**. Admin sign-in ships *with* the gate (they are inseparable per `03-auth.md`). The gate reads Supabase's authenticator assurance level: an Operator with no factor may reach **only** the enrollment flow; an Operator with a factor at `aal1` must pass a TOTP challenge; `aal2` passes. Every failure resolves to **404**, never 403 (`03-auth.md` — admin existence stays undiscoverable).

## Considered Options

- **MFA factor — TOTP vs SMS vs WebAuthn.** TOTP is Supabase-native, needs **no external provider**, costs nothing, and works with any authenticator app — the most universal reference (a guiding principle in `docs/architecture/README.md`). SMS needs a paid provider (Twilio etc.) and was rejected. WebAuthn/hardware keys (gestured at in `03-auth.md`'s tradeoffs) is stronger but not the universal, GA, provider-free path; a derived project can add it.
- **Flat vs tiered Operators.** Tiering would gate "mint Operators" behind a higher bar, shrinking the compromise blast radius. Rejected as the default for the small, mutually-trusted, MFA-gated, audit-logged Operator set (`docs/constraints/team.md`); it is additive later.

## Recovery ladder

A lost authenticator must never brick an invitation-only surface that has no sign-up to fall back on. Recovery is a ladder, each rung the fallback for the one above:

1. **Recovery codes** — one-time codes issued at enrollment, any of which substitutes for a TOTP challenge. **Hand-built** (a hashed, single-use codes table + redemption flow): Supabase does not ship recovery codes for TOTP.
2. **Peer MFA reset** — one Operator un-enrolls another's factor (audit-logged), forcing re-enrollment on next sign-in. Covers "lost phone **and** lost codes" while ≥2 Operators exist. A compromised Operator *session* could reset a peer, but still needs that peer's password to sign in — a lateral-movement speed bump, accepted for a small trusted set.
3. **DB break-glass runbook** — deleting the factor row directly. The absolute floor for the single-Operator catastrophe; a documented runbook, not a feature.

No purely self-serve path can recover from total factor loss without an out-of-band anchor — if it could, so could an attacker — so a break-glass floor is inherent, not a gap.

## Consequences

- New `operator_invitations` table (org-independent, unlike the org-scoped `invitations`): `email`, `token_hash`, `status`, `invited_by`, `expires_at`, `accepted_at`; 7-day TTL; the raw token is emailed, only its hash stored (following `03-auth.md`'s `token_hash`, not the plaintext-`token` drift in the org `invitations` table). Inviting an already-active Operator is rejected; re-inviting a pending email re-sends.
- Operator-management surface in `apps/admin`: list / invite / revoke Operator / revoke pending invitation / reset peer MFA. Each mutation writes `admin_audit_log`.
- A new `OperatorInviteEmail` template (React Email), distinct from the org `InviteEmail`.
- The seeded first Operator has no factor; on first admin sign-in the mandatory gate forces enrollment.
- **Implementation must** update `03-auth.md` (admin sign-in + mandatory MFA are now built, not deferred) and **fix the stale `admin_users` comment** in the same change, per `CLAUDE.md`.
