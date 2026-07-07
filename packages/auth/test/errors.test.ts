import { describe, expect, it } from 'vitest';
import { z, ZodError } from 'zod';
import {
  invalidInputFirstIssue,
  invalidInputGeneric,
  isNotConfirmedError,
  isSessionMissingError,
  isUserAlreadyExistsError,
  isWeakPasswordError,
  weakPasswordResult,
  type SupabaseAuthError,
} from '../src/flows/errors.js';
import { AUTH_MESSAGES } from '../src/flows/messages.js';

// The flow error contract pinned in one place: every accepted Supabase error
// shape (`code` first, then `name`/message fallbacks for older supabase-js
// versions) and the flow-invariant result shapes. How each flow *responds*
// to a detected condition stays pinned in flows.test.ts — this file is about
// detection and shaping, not flow decisions.

function cases(rows: Array<[SupabaseAuthError, boolean]>): Array<[SupabaseAuthError, boolean]> {
  return rows;
}

describe('isWeakPasswordError', () => {
  it.each(
    cases([
      [{ code: 'weak_password' }, true],
      [{ message: 'Password is too weak' }, true],
      [{ message: 'Password found in breach databases.' }, true],
      [{ message: 'password has been pwned' }, true],
      // The regex needs BOTH "password" and a weakness word — a weakness
      // word alone must not match (e.g. a "session too short" error).
      [{ message: 'token too short' }, false],
      [{ code: 'user_already_exists' }, false],
      [{}, false],
    ]),
  )('%o → %s', (error, expected) => {
    expect(isWeakPasswordError(error)).toBe(expected);
  });
});

describe('isUserAlreadyExistsError', () => {
  it.each(
    cases([
      [{ code: 'user_already_exists' }, true],
      [{ code: 'email_exists' }, true],
      [{ message: 'User already registered' }, true],
      [{ message: 'A user with this email address already exists' }, true],
      [{ code: 'weak_password' }, false],
      [{ message: 'Invalid login credentials' }, false],
      [{}, false],
    ]),
  )('%o → %s', (error, expected) => {
    expect(isUserAlreadyExistsError(error)).toBe(expected);
  });
});

describe('isNotConfirmedError', () => {
  it.each(
    cases([
      [{ code: 'email_not_confirmed' }, true],
      [{ message: 'Email not confirmed' }, true],
      [{ message: 'Invalid login credentials' }, false],
      [{}, false],
    ]),
  )('%o → %s', (error, expected) => {
    expect(isNotConfirmedError(error)).toBe(expected);
  });
});

describe('isSessionMissingError', () => {
  it.each(
    cases([
      [{ code: 'session_not_found' }, true],
      [{ code: 'no_session' }, true],
      [{ name: 'AuthSessionMissingError' }, true],
      [{ message: 'Auth session missing!' }, true],
      [{ message: 'No session found' }, true],
      [{ message: 'Invalid login credentials' }, false],
      [{}, false],
    ]),
  )('%o → %s', (error, expected) => {
    expect(isSessionMissingError(error)).toBe(expected);
  });
});

describe('weakPasswordResult', () => {
  it("passes Supabase's own message through — it names the problem", () => {
    expect(weakPasswordResult({ message: 'Password found in breach databases.' })).toEqual({
      ok: false,
      error: 'Password found in breach databases.',
      code: 'invalid-input',
    });
  });

  it('falls back to our copy when the message is empty or absent (|| semantics)', () => {
    const fallback = {
      ok: false,
      error: AUTH_MESSAGES.weakPassword,
      code: 'invalid-input',
    };
    expect(weakPasswordResult({ message: '' })).toEqual(fallback);
    expect(weakPasswordResult({})).toEqual(fallback);
  });
});

describe('invalidInputGeneric', () => {
  it('returns the generic invalid-input shape with no issue details', () => {
    expect(invalidInputGeneric()).toEqual({
      ok: false,
      error: AUTH_MESSAGES.invalidInput,
      code: 'invalid-input',
    });
  });

  it('reads identically to a wrong-credentials failure — the policy is the indistinguishability', () => {
    expect(AUTH_MESSAGES.invalidInput).toBe(AUTH_MESSAGES.invalidCredentials);
  });
});

describe('invalidInputFirstIssue', () => {
  it("surfaces the first Zod issue's message so the User can fix the field", () => {
    const schema = z.object({
      password: z.string().min(8, 'Password must be at least 8 characters'),
    });
    const parsed = schema.safeParse({ password: 'x' });
    if (parsed.success) throw new Error('expected a parse failure');

    expect(invalidInputFirstIssue(parsed.error)).toEqual({
      ok: false,
      error: 'Password must be at least 8 characters',
      code: 'invalid-input',
    });
  });

  it('falls back to the generic copy when the ZodError carries no issues', () => {
    expect(invalidInputFirstIssue(new ZodError([]))).toEqual({
      ok: false,
      error: AUTH_MESSAGES.invalidInput,
      code: 'invalid-input',
    });
  });
});
