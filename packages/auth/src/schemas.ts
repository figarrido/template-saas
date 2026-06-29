import { z } from 'zod';
import { PASSWORD_POLICY } from './policy.js';

// Shared schemas — same Zod schema validates client-side (React Hook Form)
// and inside the Server Action / flow function so they never drift.
// docs/architecture/07-frontend.md § Forms.

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address.');

// Sign-in accepts any non-empty password. We never want the form-level error
// to tell the user "your password is too short" — that would leak that the
// email exists. Server-side ADR-0002 maps every failure to a generic error.
export const signInPasswordSchema = z.string().min(1, 'Enter your password.');

// Sign-up / change-password enforce the policy length. Leaked-password (HIBP)
// is enforced by Supabase server-side and surfaced as a flow error.
export const passwordSchema = z
  .string()
  .min(PASSWORD_POLICY.minLength, `Use at least ${PASSWORD_POLICY.minLength} characters.`);

export const signInSchema = z.object({
  email: emailSchema,
  password: signInPasswordSchema,
});

// Sign-up enforces the password policy length client-side so the user gets
// the rule before they submit. Leaked-password (HIBP) is still enforced
// server-side by Supabase and surfaced as a flow error.
export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const resendVerificationSchema = z.object({
  email: emailSchema,
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
