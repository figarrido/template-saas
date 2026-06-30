# Auth emails via Supabase send-email hook → React Email

Supabase Auth (GoTrue) emails — verification, password recovery, email-change — are delivered through a Supabase **send-email Auth hook** that calls our endpoint, which renders the message with **React Email** and sends it via Resend (prod) / InBucket (dev). By default GoTrue sends these itself over SMTP using Go-template bodies, which would put auth emails outside the React Email design system that `07-frontend.md` makes *the* email layer. Routing them through the hook keeps every email — auth, invitation, transactional — in one design system and one code path in `packages/email`, so branded auth emails ship by default instead of being the surprising exception.

## Considered Options

- **GoTrue Go-template emails over SMTP** — lower weight, fewer moving parts, matches the InBucket dev flow directly. Rejected as the default because it forks email styling and contradicts the frontend doc; offered as the lighter trade for derived projects that don't want the hook.

## Consequences

- A send-email hook endpoint plus its config wiring (`supabase/config.toml` locally, dashboard in prod) is weight every derived project carries.
- The hook receives the email type and the `token_hash`; templates must build the `{{ .TokenHash }}`-style links that the `/auth/confirm` Route Handler consumes (see [03-auth](../architecture/03-auth.md)) rather than the legacy hosted `/verify` URL.
- The hook is on the critical path for sign-up and recovery — its failure modes (timeouts, render errors) must be handled, and it shares the deliverability fate of the rest of `packages/email`.
