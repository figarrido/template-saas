import { describe, expect, it } from 'vitest';
import { PASSWORD_POLICY } from '../src/policy.js';
import {
  emailSchema,
  passwordSchema,
  signInSchema,
  signInPasswordSchema,
  signUpSchema,
} from '../src/schemas.js';

describe('emailSchema', () => {
  it('lowercases and trims valid input', () => {
    const result = emailSchema.parse('  User@Example.COM ');
    expect(result).toBe('user@example.com');
  });

  it('rejects malformed addresses', () => {
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
    expect(emailSchema.safeParse('').success).toBe(false);
  });
});

describe('passwordSchema (signup / change-password)', () => {
  it('rejects passwords shorter than the policy minimum', () => {
    const short = 'x'.repeat(PASSWORD_POLICY.minLength - 1);
    expect(passwordSchema.safeParse(short).success).toBe(false);
  });

  it('accepts passwords at the policy minimum', () => {
    const ok = 'x'.repeat(PASSWORD_POLICY.minLength);
    expect(passwordSchema.safeParse(ok).success).toBe(true);
  });
});

describe('signInPasswordSchema', () => {
  it('accepts short passwords — the server returns generic errors to avoid enumeration', () => {
    expect(signInPasswordSchema.safeParse('x').success).toBe(true);
  });

  it('rejects empty input', () => {
    expect(signInPasswordSchema.safeParse('').success).toBe(false);
  });
});

describe('signInSchema', () => {
  it('parses email + password together', () => {
    const parsed = signInSchema.parse({ email: 'a@b.co', password: 'p' });
    expect(parsed).toEqual({ email: 'a@b.co', password: 'p' });
  });
});

describe('signUpSchema', () => {
  it('accepts a valid email + policy-compliant password', () => {
    const parsed = signUpSchema.parse({
      email: 'A@B.co',
      password: 'x'.repeat(PASSWORD_POLICY.minLength),
    });
    expect(parsed).toEqual({
      email: 'a@b.co',
      password: 'x'.repeat(PASSWORD_POLICY.minLength),
    });
  });

  it('rejects too-short passwords with the same policy as passwordSchema', () => {
    const short = 'x'.repeat(PASSWORD_POLICY.minLength - 1);
    expect(signUpSchema.safeParse({ email: 'a@b.co', password: short }).success).toBe(false);
  });

  it('rejects malformed emails', () => {
    expect(
      signUpSchema.safeParse({
        email: 'not-an-email',
        password: 'x'.repeat(PASSWORD_POLICY.minLength),
      }).success,
    ).toBe(false);
  });
});
