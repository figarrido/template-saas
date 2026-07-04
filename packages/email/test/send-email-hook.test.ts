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
    const msgs = buildAuthEmail(payload('signup'), { siteUrl: SITE_URL, from: FROM });
    expect(msgs).toHaveLength(1);
    const msg = msgs[0]!;
    expect(msg.to).toBe('user@example.com');
    expect(msg.from).toBe(FROM);
    expect(msg.subject).toMatch(/confirm/i);

    const html = await render(msg.react!);
    expect(html).toContain('https://app.test/auth/confirm');
    expect(html).toContain('token_hash=tk_abc123');
    expect(html).toContain('type=signup');
    expect(html).toContain('next=%2Fdashboard');
  });

  it('uses PasswordResetEmail for recovery', async () => {
    const msg = buildAuthEmail(payload('recovery'), { siteUrl: SITE_URL, from: FROM })[0]!;
    expect(msg.subject).toMatch(/reset/i);
    const html = await render(msg.react!);
    expect(html).toContain('type=recovery');
  });

  it('uses VerifyEmail with an invite-specific subject for invite', async () => {
    const msg = buildAuthEmail(payload('invite'), { siteUrl: SITE_URL, from: FROM })[0]!;
    expect(msg.subject).toMatch(/invit/i);
  });

  it('builds TWO confirmations for a double-confirm email change — new + current address', async () => {
    const emailChange = {
      user: { email: 'old@example.com', new_email: 'new@example.com' },
      email_data: {
        token_hash: 'tk_current',
        token_hash_new: 'tk_new',
        redirect_to: '/dashboard',
        email_action_type: 'email_change',
        site_url: SITE_URL,
      },
    } satisfies SendEmailHookPayload;

    const msgs = buildAuthEmail(emailChange, { siteUrl: SITE_URL, from: FROM });
    expect(msgs).toHaveLength(2);
    const byTo = Object.fromEntries(msgs.map((m) => [m.to as string, m]));

    // The NEW address gets the new-side token — this is the message that was
    // never sent before the fix.
    const newHtml = await render(byTo['new@example.com']!.react!);
    expect(newHtml).toContain('token_hash=tk_new');
    expect(newHtml).toContain('type=email_change');

    // The CURRENT address authorises the change with the current-side token.
    const oldHtml = await render(byTo['old@example.com']!.react!);
    expect(oldHtml).toContain('token_hash=tk_current');
    expect(oldHtml).toContain('type=email_change');
  });

  it('sends a single email change confirmation when double-confirm is off (one token)', () => {
    const singleConfirm = {
      user: { email: 'old@example.com', new_email: 'new@example.com' },
      email_data: {
        token_hash: 'tk_only',
        email_action_type: 'email_change',
        site_url: SITE_URL,
      },
    } satisfies SendEmailHookPayload;
    const msgs = buildAuthEmail(singleConfirm, { siteUrl: SITE_URL, from: FROM });
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.to).toBe('new@example.com');
  });

  it('returns [] for an unknown email_action_type', () => {
    const bogus = {
      user: { email: 'x@y.test' },
      email_data: {
        token_hash: 'tk',
        email_action_type: 'reauthentication' as unknown as 'signup',
      },
    } satisfies SendEmailHookPayload;
    expect(buildAuthEmail(bogus, { siteUrl: SITE_URL, from: FROM })).toEqual([]);
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

  it('sends two emails for a double-confirm email change (current + new address)', async () => {
    const provider = recordingProvider();
    const body = JSON.stringify({
      user: { email: 'old@example.com', new_email: 'new@example.com' },
      email_data: {
        token_hash: 'tk_current',
        token_hash_new: 'tk_new',
        email_action_type: 'email_change',
        site_url: SITE_URL,
      },
    });
    const headers = signedHeaders('msg_ec', '1700000002', body);

    const result = await handleSendEmailHook(body, headers, {
      secret: SECRET,
      siteUrl: SITE_URL,
      from: FROM,
      provider,
    });

    expect(result.ok).toBe(true);
    expect(provider.sent).toHaveLength(2);
    expect(provider.sent.map((m) => m.to as string).sort()).toEqual([
      'new@example.com',
      'old@example.com',
    ]);
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
