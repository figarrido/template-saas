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

// Forgot-password: just the address. The flow always returns the generic
// "if an account exists..." response so a validation failure has the same
// shape as a success.
export const requestPasswordResetSchema = z.object({
  email: emailSchema,
});

// Reset-password: a new password that satisfies the shared policy. The
// User is identified by the recovery Session that the /auth/confirm route
// established when verifying the token_hash, so no email is required here.
export const updatePasswordSchema = z.object({
  password: passwordSchema,
});

// Change-password: the current password is validated as "non-empty" (any
// length is accepted client-side so we don't leak the policy on the re-auth
// field), the new password is held to the full policy. ADR-0003.
export const changePasswordSchema = z.object({
  currentPassword: signInPasswordSchema,
  newPassword: passwordSchema,
});

// Change-email: the current password gates the re-auth (ADR-0003); the new
// email is validated and normalised exactly like sign-in / sign-up so it
// round-trips through Supabase the same way.
export const changeEmailSchema = z.object({
  currentPassword: signInPasswordSchema,
  newEmail: emailSchema,
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>;
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;
