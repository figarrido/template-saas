---
'@template/auth': minor
---

Auth slice 1 — sign-in & sign-out + auth foundation.

- Add injectable flow functions in `packages/auth/flows`: `signIn`, `signOut`
  (scope `'local'`), and `resendVerification`. Each accepts a Supabase
  client and returns a typed `ActionResult` so the Server Action in
  `apps/web` stays a thin adapter and the same logic is exercised by the
  integration suite against local Supabase.
- Implement the ADR-0002 enumeration mapping: any sign-in failure surfaces
  the single generic "invalid email or password", except the correct-
  password-but-unconfirmed branch which surfaces "email not confirmed" with
  a resend affordance.
- Add the shared email / password Zod schemas and the `PASSWORD_POLICY`
  constants — same schema validates client and Server Action.
- Add `destinationForOrganizations(orgs)` first-login routing helper:
  0 → `/onboarding/first-org`, 1 → `/{slug}/dashboard`, 2+ → `/orgs`.

New exports: `flows`, `schemas`, `policy` entry points.
