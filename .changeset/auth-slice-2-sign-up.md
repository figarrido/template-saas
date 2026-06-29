---
'@template/auth': minor
'@template/email': minor
---

Auth slice 2 — sign-up + email verification.

- Add `signUp` and `verifyEmailToken` flow functions in `packages/auth/flows`,
  plus the shared `signUpSchema` / `resendVerificationSchema` Zod schemas.
  Sign-up returns the same generic "check your email" interstitial whether
  the email is new or already registered (ADR-0002); Supabase's
  `weak_password` (HIBP) error is surfaced as a clear invalid-input.
- Add a `@template/email/hooks/send-email` entry that implements the
  Supabase send-email Auth hook (ADR-0005): Standard Webhooks signature
  verification, then renders `VerifyEmail` / `PasswordResetEmail` via React
  Email and dispatches through the selected `EmailProvider`. Auth email
  links point at `/auth/confirm` with `token_hash` + `type` (+ optional
  `next`), per the parent PRD's execution model.
- New exports: `signUp`, `verifyEmailToken`, `isEmailOtpType`,
  `EMAIL_OTP_TYPES`, `signUpSchema`, `resendVerificationSchema`,
  `passwordSchema`, plus `@template/email/hooks/send-email`.
