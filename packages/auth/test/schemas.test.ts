import { describe, expect, it } from 'vitest';
import { PASSWORD_POLICY } from '../src/policy.js';
import {
  changeEmailSchema,
  changePasswordSchema,
  emailSchema,
  passwordSchema,
  signInSchema,
  signInPasswordSchema,
  signUpSchema,
  requestPasswordResetSchema,
  updatePasswordSchema,
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

describe('requestPasswordResetSchema', () => {
  it('normalises the email like the sign-in schema', () => {
    const parsed = requestPasswordResetSchema.parse({ email: '  Foo@Bar.CO ' });
    expect(parsed).toEqual({ email: 'foo@bar.co' });
  });

  it('rejects malformed emails — but the flow swallows the failure into the generic success shape', () => {
    expect(requestPasswordResetSchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
  });
});

describe('updatePasswordSchema', () => {
  it('shares the policy length with sign-up — too-short rejected', () => {
    const short = 'x'.repeat(PASSWORD_POLICY.minLength - 1);
    expect(updatePasswordSchema.safeParse({ password: short }).success).toBe(false);
  });

  it('accepts a policy-compliant password (HIBP is enforced server-side)', () => {
    const ok = 'x'.repeat(PASSWORD_POLICY.minLength);
    expect(updatePasswordSchema.safeParse({ password: ok }).success).toBe(true);
  });
});

describe('changePasswordSchema', () => {
  const STRONG = 'x'.repeat(PASSWORD_POLICY.minLength);

  it('accepts a non-empty current password and a policy-compliant new password', () => {
    const parsed = changePasswordSchema.parse({
      currentPassword: 'whatever',
      newPassword: STRONG,
    });
    expect(parsed).toEqual({ currentPassword: 'whatever', newPassword: STRONG });
  });

  it('rejects an empty current password', () => {
    expect(
      changePasswordSchema.safeParse({ currentPassword: '', newPassword: STRONG }).success,
    ).toBe(false);
  });

  it('rejects a too-short new password (mirrors signup policy)', () => {
    const short = 'x'.repeat(PASSWORD_POLICY.minLength - 1);
    expect(
      changePasswordSchema.safeParse({ currentPassword: 'whatever', newPassword: short }).success,
    ).toBe(false);
  });
});

describe('changeEmailSchema', () => {
  it('accepts a non-empty current password and a valid new email; normalises the address', () => {
    const parsed = changeEmailSchema.parse({
      currentPassword: 'whatever',
      newEmail: '  New@Example.COM ',
    });
    expect(parsed).toEqual({ currentPassword: 'whatever', newEmail: 'new@example.com' });
  });

  it('rejects an empty current password', () => {
    expect(
      changeEmailSchema.safeParse({ currentPassword: '', newEmail: 'a@b.co' }).success,
    ).toBe(false);
  });

  it('rejects a malformed new email', () => {
    expect(
      changeEmailSchema.safeParse({ currentPassword: 'whatever', newEmail: 'not-an-email' })
        .success,
    ).toBe(false);
  });
});
