import { describe, expect, it } from 'vitest';
import { render } from '@react-email/components';
import { InviteEmail, VerifyEmail, WelcomeEmail, PasswordResetEmail } from '../src/templates/index.js';

describe('email templates render', () => {
  it('WelcomeEmail renders the display name', async () => {
    const html = await render(<WelcomeEmail displayName="Felipe" appUrl="https://example.test" />);
    expect(html).toContain('Felipe');
    expect(html).toContain('https://example.test');
  });

  it('VerifyEmail renders the verify URL', async () => {
    const html = await render(<VerifyEmail verifyUrl="https://verify.test/x" />);
    expect(html).toContain('https://verify.test/x');
  });

  it('InviteEmail renders org and inviter', async () => {
    const html = await render(
      <InviteEmail orgName="Acme" inviterName="Sam" acceptUrl="https://accept.test/x" />,
    );
    expect(html).toContain('Acme');
    expect(html).toContain('Sam');
    expect(html).toContain('https://accept.test/x');
  });

  it('PasswordResetEmail renders the reset URL', async () => {
    const html = await render(<PasswordResetEmail resetUrl="https://reset.test/x" />);
    expect(html).toContain('https://reset.test/x');
  });
});
