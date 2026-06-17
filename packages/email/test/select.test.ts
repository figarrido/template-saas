import { describe, expect, it } from 'vitest';
import { selectEmailProvider } from '../src/select.js';

describe('selectEmailProvider', () => {
  it('picks smtp in dev by default', () => {
    const p = selectEmailProvider({ NODE_ENV: 'development' });
    expect(p.name).toBe('smtp');
  });

  it('picks resend in production when key present', () => {
    const p = selectEmailProvider({ NODE_ENV: 'production', RESEND_API_KEY: 'r_x' });
    expect(p.name).toBe('resend');
  });

  it('throws if MAIL_PROVIDER=resend but no key', () => {
    expect(() => selectEmailProvider({ MAIL_PROVIDER: 'resend' })).toThrow(
      /RESEND_API_KEY is required/,
    );
  });

  it('honors explicit MAIL_PROVIDER override', () => {
    const p = selectEmailProvider({ NODE_ENV: 'production', MAIL_PROVIDER: 'smtp' });
    expect(p.name).toBe('smtp');
  });
});
