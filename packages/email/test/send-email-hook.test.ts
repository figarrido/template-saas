import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { render } from '@react-email/components';
import {
  buildAuthEmail,
  handleSendEmailHook,
  verifyStandardWebhook,
  type SendEmailHookPayload,
} from '../src/hooks/send-email.js';
import type { EmailMessage, EmailProvider } from '../src/provider.js';

// Cases mirror issue #4 + parent PRD § Testing for the send-email hook:
//   * confirm URL points at /auth/confirm with token_hash + type (+ next)
//   * recovery picks the PasswordResetEmail template, signup/invite/etc.
//     pick VerifyEmail
//   * Standard Webhooks signature is required (401 on missing/bad headers)
//   * a valid signature dispatches to the EmailProvider exactly once
//   * unsupported email_action_type returns 422 without sending

const SECRET_B64 = Buffer.from('test-hook-secret-32-bytes-long!!').toString('base64');
const SECRET = `v1,whsec_${SECRET_B64}`;
const SITE_URL = 'https://app.test';
const FROM = 'Acme <auth@acme.test>';

function recordingProvider(): EmailProvider & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return {
    name: 'smtp',
    sent,
    async send(msg) {
      sent.push(msg);
      return { provider: 'smtp', id: 'recorded' };
    },
  } as EmailProvider & { sent: EmailMessage[] };
}

function signedHeaders(id: string, ts: string, body: string) {
  const key = Buffer.from(SECRET_B64, 'base64');
  const sig = createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');
  return { id, timestamp: ts, signature: `v1,${sig}` };
}

function payload(type: SendEmailHookPayload['email_data']['email_action_type']) {
  return {
    user: { email: 'user@example.com' },
    email_data: {
      token_hash: 'tk_abc123',
      redirect_to: '/dashboard',
      email_action_type: type,
      site_url: SITE_URL,
    },
  } satisfies SendEmailHookPayload;
}

describe('buildAuthEmail', () => {
  it('builds a VerifyEmail with /auth/confirm URL for signup', async () => {
    const msg = buildAuthEmail(payload('signup'), { siteUrl: SITE_URL, from: FROM });
    expect(msg).not.toBeNull();
    expect(msg!.to).toBe('user@example.com');
    expect(msg!.from).toBe(FROM);
    expect(msg!.subject).toMatch(/confirm/i);

    const html = await render(msg!.react!);
    expect(html).toContain('https://app.test/auth/confirm');
    expect(html).toContain('token_hash=tk_abc123');
    expect(html).toContain('type=signup');
    expect(html).toContain('next=%2Fdashboard');
  });

  it('uses PasswordResetEmail for recovery', async () => {
    const msg = buildAuthEmail(payload('recovery'), { siteUrl: SITE_URL, from: FROM });
    expect(msg!.subject).toMatch(/reset/i);
    const html = await render(msg!.react!);
    expect(html).toContain('type=recovery');
  });

  it('uses VerifyEmail with an invite-specific subject for invite', async () => {
    const msg = buildAuthEmail(payload('invite'), { siteUrl: SITE_URL, from: FROM });
    expect(msg!.subject).toMatch(/invit/i);
  });

  it('returns null for an unknown email_action_type', () => {
    const bogus = {
      user: { email: 'x@y.test' },
      email_data: {
        token_hash: 'tk',
        email_action_type: 'reauthentication' as unknown as 'signup',
      },
    } satisfies SendEmailHookPayload;
    expect(buildAuthEmail(bogus, { siteUrl: SITE_URL, from: FROM })).toBeNull();
  });
});

describe('verifyStandardWebhook', () => {
  it('accepts a correctly-signed payload', () => {
    const body = JSON.stringify({ hello: 'world' });
    const headers = signedHeaders('msg_1', '1700000000', body);
    expect(verifyStandardWebhook(body, headers, SECRET)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const body = JSON.stringify({ hello: 'world' });
    const headers = signedHeaders('msg_1', '1700000000', body);
    expect(verifyStandardWebhook(body + 'tamper', headers, SECRET)).toBe(false);
  });

  it('rejects a missing signature header', () => {
    expect(
      verifyStandardWebhook('body', { id: 'i', timestamp: 't', signature: null }, SECRET),
    ).toBe(false);
  });

  it('accepts a raw base64 secret (no v1,/whsec_ prefix)', () => {
    const body = '{}';
    const headers = signedHeaders('msg', '1', body);
    expect(verifyStandardWebhook(body, headers, SECRET_B64)).toBe(true);
  });
});

describe('handleSendEmailHook', () => {
  it('verifies signature, renders, and sends exactly one email', async () => {
    const provider = recordingProvider();
    const body = JSON.stringify(payload('signup'));
    const headers = signedHeaders('msg_send', '1700000001', body);

    const result = await handleSendEmailHook(body, headers, {
      secret: SECRET,
      siteUrl: SITE_URL,
      from: FROM,
      provider,
    });

    expect(result.ok).toBe(true);
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]?.to).toBe('user@example.com');
  });

  it('returns 401 when signature is missing', async () => {
    const provider = recordingProvider();
    const body = JSON.stringify(payload('signup'));
    const result = await handleSendEmailHook(
      body,
      { id: null, timestamp: null, signature: null },
      { secret: SECRET, siteUrl: SITE_URL, from: FROM, provider },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(401);
    expect(provider.sent).toHaveLength(0);
  });

  it('returns 401 when signature is wrong', async () => {
    const provider = recordingProvider();
    const body = JSON.stringify(payload('signup'));
    const headers = signedHeaders('msg', '1', body);
    headers.signature = 'v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

    const result = await handleSendEmailHook(body, headers, {
      secret: SECRET,
      siteUrl: SITE_URL,
      from: FROM,
      provider,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(401);
    expect(provider.sent).toHaveLength(0);
  });

  it('returns 422 (no send) for an unsupported action type', async () => {
    const provider = recordingProvider();
    const body = JSON.stringify({
      user: { email: 'x@y.test' },
      email_data: { token_hash: 't', email_action_type: 'reauthentication' },
    });
    const headers = signedHeaders('msg', '1', body);

    const result = await handleSendEmailHook(body, headers, {
      secret: SECRET,
      siteUrl: SITE_URL,
      from: FROM,
      provider,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(422);
    expect(provider.sent).toHaveLength(0);
  });
});
