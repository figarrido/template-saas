# Account-enumeration posture for auth flows

Sign-up and forgot-password responses are always generic — sign-up of an already-registered email returns the same "check your email" interstitial (Supabase obfuscates the duplicate and notifies the real owner instead of erroring), and `resetPasswordForEmail` always reports success. This prevents an attacker from probing which emails are registered. We accept **one deliberate exception**: sign-in surfaces "email not confirmed" (with a resend affordance) *only after a correct password* — Supabase returns that error only on valid credentials, returning generic "Invalid login credentials" otherwise. Revealing the unconfirmed state to someone who already proved they know the password does not aid enumeration, and it's the only way to offer resend at the point of friction.

## Considered Options

- **Strict, zero reveal** — never surface account state anywhere, including unconfirmed-on-login; resend lives only on a standalone page. Rejected: clunky UX for a leak that the correct-password gate already neutralizes.
- **UX-first, precise errors** ("email already registered", "no account found", "please verify") — rejected: leaks the registered-email set, a poor default for a template others inherit.

## Consequences

- Sign-in error handling must branch on Supabase's exact error string (`"Email not confirmed"` vs. others). The current `loginAction` returns `error.message` raw — that must change to the mapped, generic responses.
- Derived projects that want stricter behavior remove the one exception; those wanting friendlier errors override at the flow layer. The default is the privacy-preserving one.
