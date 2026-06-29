export { signIn, type SignInResult } from './sign-in.js';
export { signOut, type SignOutResult } from './sign-out.js';
export { signUp, type SignUpResult, type SignUpOptions } from './sign-up.js';
export { resendVerification, type ResendVerificationResult } from './resend-verification.js';
export { changePassword, type ChangePasswordResult } from './change-password.js';
export {
  changeEmail,
  type ChangeEmailResult,
  type ChangeEmailOptions,
} from './change-email.js';
export {
  requestPasswordReset,
  type RequestPasswordResetResult,
  type RequestPasswordResetOptions,
} from './request-password-reset.js';
export { updatePassword, type UpdatePasswordResult } from './update-password.js';
export {
  verifyEmailToken,
  isEmailOtpType,
  EMAIL_OTP_TYPES,
  type VerifyEmailResult,
  type EmailOtpType,
} from './verify-email.js';
export {
  signInOAuth,
  type SignInOAuthInput,
  type SignInOAuthResult,
} from './sign-in-oauth.js';
export { exchangeOAuthCode, type ExchangeOAuthCodeResult } from './exchange-oauth-code.js';
export { destinationForOrganizations, type Destination, type OrgRef } from './routing.js';
export { AUTH_MESSAGES } from './messages.js';
export type { ActionResult, ActionErrorCode, AuthClient } from './types.js';
