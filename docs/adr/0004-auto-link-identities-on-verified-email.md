# Auto-link Identities on verified-email match

When a person signs in with an OAuth provider whose **provider-verified email** matches an existing User, Supabase auto-links the new Identity onto that same User rather than creating a duplicate account. We keep this default. It gives one User / one set of org data regardless of how they signed in, which is the behavior users expect, and the verified-email precondition is the safety guard — Supabase only auto-links when both emails are confirmed, so an OAuth provider asserting an unverified email cannot be used to graft onto someone else's account. The trust assumption is explicit: **we trust each enabled OAuth provider's `email_verified` claim.**

## Considered Options

- **Manual linking only** (`enable_manual_linking`, no auto-link) — a logged-in User must explicitly link a provider in settings. No silent merges, but it forces building the link/unlink UI now and handling the "OAuth email already exists but isn't linked" dead-end. Rejected for this build; the manual link/unlink settings UI is deferred and can be layered on later without unwinding auto-link.
- **Separate accounts per provider** — rejected: produces duplicate Users and "where's my data?" confusion.

## Consequences

- Hard to reverse once users exist: changing the policy later means reconciling already-linked (or already-duplicated) accounts. Recorded here so a future reader doesn't "fix" the auto-link as if it were accidental.
- Only OAuth providers we explicitly enable (the `PROVIDERS` array in `packages/auth`) are trusted for auto-link. Before enabling a provider, confirm it verifies email.
- A User can therefore hold multiple Identities and possibly no password Identity — see the OAuth-only caveat in [ADR 0003](0003-reauth-for-sensitive-account-changes.md).
