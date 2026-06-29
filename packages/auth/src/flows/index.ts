export { signIn, type SignInResult } from './sign-in.js';
export { signOut, type SignOutResult } from './sign-out.js';
export { signUp, type SignUpResult, type SignUpOptions } from './sign-up.js';
export { resendVerification, type ResendVerificationResult } from './resend-verification.js';
export {
  verifyEmailToken,
  isEmailOtpType,
  EMAIL_OTP_TYPES,
  type VerifyEmailResult,
  type EmailOtpType,
} from './verify-email.js';
export { destinationForOrganizations, type Destination, type OrgRef } from './routing.js';
export { AUTH_MESSAGES } from './messages.js';
export type { ActionResult, ActionErrorCode, AuthClient } from './types.js';
