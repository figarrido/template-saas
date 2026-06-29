export { signIn, type SignInResult } from './sign-in.js';
export { signOut, type SignOutResult } from './sign-out.js';
export { resendVerification, type ResendVerificationResult } from './resend-verification.js';
export {
  signInOAuth,
  type SignInOAuthInput,
  type SignInOAuthResult,
} from './sign-in-oauth.js';
export { exchangeOAuthCode, type ExchangeOAuthCodeResult } from './exchange-oauth-code.js';
export { destinationForOrganizations, type Destination, type OrgRef } from './routing.js';
export { AUTH_MESSAGES } from './messages.js';
export type { ActionResult, ActionErrorCode, AuthClient } from './types.js';
