// The flow error contract: every mapping from Supabase Auth error shapes and
// Zod parse failures onto the flow `ActionResult` lives here — one module to
// read, and one test surface (test/errors.test.ts) to pin, for what a failed
// flow reveals to the caller. User-facing copy lives in `messages.ts`; the
// account-enumeration posture the policies implement is ADR-0002.
//
// Two kinds of export:
//
// - Predicates (`is*Error`) detect a Supabase error condition, matching
//   `code` first and falling back defensively to `name`/message shapes for
//   older supabase-js versions. How a flow *responds* to a detected
//   condition stays that flow's decision — e.g. sign-up collapses
//   `isUserAlreadyExistsError` onto a generic success, which would be wrong
//   anywhere else.
//
// - Result shapers return the failure shapes that are flow-invariant:
//   `weakPasswordResult` plus the two named validation policies,
//   `invalidInputGeneric` and `invalidInputFirstIssue`. The third validation
//   policy — silent success, where a parse failure must be indistinguishable
//   from the happy path (request-password-reset, resend-verification) —
//   deliberately has no helper: its success copy is flow-specific and the
//   enumeration reasoning belongs next to the `return` it protects.

import type { ZodError } from 'zod';
import { AUTH_MESSAGES } from './messages.js';
import type { ActionResult } from './types.js';

export type SupabaseAuthError = {
  code?: string | undefined;
  message?: string;
  name?: string;
};

/**
 * Supabase signals a policy/HIBP rejection with `code: 'weak_password'`.
 * Older supabase-js versions only populate the message, so we fall back to
 * a defensive regex match on it.
 */
export function isWeakPasswordError(error: SupabaseAuthError): boolean {
  if (error.code === 'weak_password') return true;
  const message = error.message ?? '';
  return /password/i.test(message) && /(weak|breach|short|leaked|pwned)/i.test(message);
}

/**
 * True when Supabase rejected a sign-up because the address is already
 * registered. Newer GoTrue versions return a hard `user_already_exists`
 * (HTTP 422) for an existing *confirmed* account instead of the obfuscated
 * empty-`identities` user older versions returned — the sign-up flow collapses
 * both onto the same generic success so neither leaks account existence
 * (ADR-0002).
 */
export function isUserAlreadyExistsError(error: SupabaseAuthError): boolean {
  if (error.code === 'user_already_exists' || error.code === 'email_exists') return true;
  const message = error.message ?? '';
  return /already\s+(registered|exists)/i.test(message);
}

/**
 * True when sign-in failed only because the account is not yet confirmed.
 * Supabase raises `email_not_confirmed` only when the password matched,
 * which is what makes branching on it safe under ADR-0002 — this is the one
 * deliberate exception to the generic-error posture. Older supabase-js
 * versions only expose the string; the integration test pins the contract.
 */
export function isNotConfirmedError(error: SupabaseAuthError): boolean {
  if (error.code === 'email_not_confirmed') return true;
  return typeof error.message === 'string' && /not confirmed/i.test(error.message);
}

/**
 * True when an `updateUser`-style call failed because no Session backs the
 * client — the recovery link was already consumed or never landed.
 */
export function isSessionMissingError(error: SupabaseAuthError): boolean {
  if (error.code === 'session_not_found' || error.code === 'no_session') return true;
  if (error.name === 'AuthSessionMissingError') return true;
  const message = error.message ?? '';
  return /session\b.*\bmissing|missing\b.*\bsession|no\s+session/i.test(message);
}

/**
 * The one flow-invariant Supabase-error mapping: a weak/breached password
 * surfaces as `invalid-input` with Supabase's own message (it names the
 * problem — breach corpus, length policy), falling back to our copy when the
 * message is empty. Used identically by sign-up, change-password, and
 * update-password; not an enumeration concern on any of those surfaces.
 */
export function weakPasswordResult(error: SupabaseAuthError): ActionResult<never> {
  return {
    ok: false,
    error: error.message || AUTH_MESSAGES.weakPassword,
    code: 'invalid-input',
  };
}

/**
 * Generic-error validation policy: reveal only that the input didn't parse,
 * never which field or why. For flows on unauthenticated surfaces where
 * issue detail could aid enumeration — sign-in and the OAuth entry points.
 */
export function invalidInputGeneric(): ActionResult<never> {
  return { ok: false, error: AUTH_MESSAGES.invalidInput, code: 'invalid-input' };
}

/**
 * First-issue validation policy: surface the first Zod issue's message
 * ("Password must be at least…") so the User can fix the field. For flows
 * where naming the problem cannot aid enumeration — sign-up and the
 * signed-in account-change flows.
 */
export function invalidInputFirstIssue(error: ZodError): ActionResult<never> {
  return {
    ok: false,
    error: error.issues[0]?.message ?? AUTH_MESSAGES.invalidInput,
    code: 'invalid-input',
  };
}
