import { createHmac, timingSafeEqual } from 'node:crypto';
import { VerifyEmail } from '../templates/VerifyEmail.js';
import { PasswordResetEmail } from '../templates/PasswordResetEmail.js';
import type { EmailMessage, EmailProvider } from '../provider.js';

// Supabase Auth "send_email" hook integration. Per ADR-0005 the template
// renders every auth email through React Email — Supabase delegates to
// this hook instead of using its built-in email pipeline, which means
// dev/prod templates live in one place and one code path.
//
// The hook contract (Standard Webhooks):
//   * Supabase POSTs JSON to our URL with `webhook-id`, `webhook-timestamp`,
//     and `webhook-signature` headers.
//   * Signature: base64(HMAC-SHA256(`${id}.${ts}.${body}`, secret)).
//   * Secret is configured in supabase/config.toml as a `v1,whsec_<base64>`
//     value; we accept that prefix as well as a raw base64 secret.
//
// Payload (subset we use):
//   {
//     user: { email: string; ... },
//     email_data: {
//       token: string;          // numeric OTP — we ignore in favor of token_hash
//       token_hash: string;     // the value we put in the confirm link
//       redirect_to: string;    // appended as ?next= on the confirm URL
//       email_action_type: 'signup' | 'recovery' | 'invite' | 'email_change' | 'magiclink';
//       site_url: string;       // Supabase's configured site_url; falls back when our env is missing
//     }
//   }

export type SendEmailHookPayload = {
  user: { email: string };
  email_data: {
    token_hash: string;
    redirect_to?: string;
    email_action_type: 'signup' | 'recovery' | 'invite' | 'email_change' | 'magiclink';
    site_url?: string;
  };
};

export type SendEmailHookConfig = {
  secret: string;
  /** Origin of the deployed app — confirm URLs are built relative to this. */
  siteUrl: string;
  /** From: header for every auth email. e.g. "Acme <auth@acme.test>". */
  from: string;
  provider: EmailProvider;
};

export type StandardWebhookHeaders = {
  id?: string | null;
  timestamp?: string | null;
  signature?: string | null;
};

export type HandleSendEmailResult =
  | { ok: true; sent: { to: string; subject: string } }
  | { ok: false; status: 400 | 401 | 422; error: string };

/**
 * Verify the Standard Webhooks signature on the incoming request and, if
 * valid, render the matching React Email template and send it via the
 * supplied provider. Returns a shape the route handler converts into an
 * HTTP response — pure data so it can be unit-tested without mocking the
 * NextRequest/NextResponse cycle.
 */
export async function handleSendEmailHook(
  rawBody: string,
  headers: StandardWebhookHeaders,
  config: SendEmailHookConfig,
): Promise<HandleSendEmailResult> {
  if (!headers.id || !headers.timestamp || !headers.signature) {
    return { ok: false, status: 401, error: 'missing webhook headers' };
  }

  if (!verifyStandardWebhook(rawBody, headers, config.secret)) {
    return { ok: false, status: 401, error: 'invalid webhook signature' };
  }

  let payload: SendEmailHookPayload;
  try {
    payload = JSON.parse(rawBody) as SendEmailHookPayload;
  } catch {
    return { ok: false, status: 400, error: 'invalid JSON body' };
  }

  const message = buildAuthEmail(payload, config);
  if (!message) {
    return { ok: false, status: 422, error: 'unsupported email_action_type' };
  }

  await config.provider.send(message);
  return { ok: true, sent: { to: payload.user.email, subject: message.subject } };
}

/**
 * Render the right React Email template for a given Supabase auth email
 * payload. Exported separately so unit tests can pin the URL-shape per
 * action type without exercising HMAC + provider send.
 */
export function buildAuthEmail(
  payload: SendEmailHookPayload,
  config: Pick<SendEmailHookConfig, 'siteUrl' | 'from'>,
): EmailMessage | null {
  const { user, email_data } = payload;
  const type = email_data.email_action_type;
  const confirmUrl = buildConfirmUrl(config.siteUrl, email_data);

  switch (type) {
    case 'signup':
    case 'invite':
    case 'email_change':
    case 'magiclink':
      return {
        to: user.email,
        from: config.from,
        subject: verifySubject(type),
        react: VerifyEmail({ verifyUrl: confirmUrl }),
      };
    case 'recovery':
      return {
        to: user.email,
        from: config.from,
        subject: 'Reset your password',
        react: PasswordResetEmail({ resetUrl: confirmUrl }),
      };
    default:
      return null;
  }
}

function verifySubject(type: 'signup' | 'invite' | 'email_change' | 'magiclink'): string {
  switch (type) {
    case 'email_change':
      return 'Confirm your new email address';
    case 'invite':
      return "You've been invited";
    default:
      return 'Confirm your email';
  }
}

function buildConfirmUrl(
  siteUrl: string,
  data: SendEmailHookPayload['email_data'],
): string {
  // `/auth/confirm` lives in apps/web's router. It accepts `token_hash`,
  // `type`, and an optional `next` for redirect-after-verify.
  const base = new URL('/auth/confirm', siteUrl);
  base.searchParams.set('token_hash', data.token_hash);
  base.searchParams.set('type', data.email_action_type);
  if (data.redirect_to) base.searchParams.set('next', data.redirect_to);
  return base.toString();
}

/**
 * Standard Webhooks signature check. Computes HMAC-SHA256 over
 * `${id}.${timestamp}.${body}` and compares against the base64-encoded
 * signature(s) in the `webhook-signature` header. Multiple comma-separated
 * `v1,<sig>` entries are tolerated — Supabase rotates signatures by
 * publishing both old and new while a secret rolls over.
 */
export function verifyStandardWebhook(
  body: string,
  headers: StandardWebhookHeaders,
  secret: string,
): boolean {
  if (!headers.id || !headers.timestamp || !headers.signature) return false;

  const key = decodeWebhookSecret(secret);
  if (!key) return false;

  const signed = `${headers.id}.${headers.timestamp}.${body}`;
  const expected = createHmac('sha256', key).update(signed).digest();

  for (const entry of headers.signature.split(' ')) {
    const [version, value] = entry.split(',');
    if (version !== 'v1' || !value) continue;
    const provided = safeBase64Decode(value);
    if (!provided) continue;
    if (provided.length === expected.length && timingSafeEqual(provided, expected)) {
      return true;
    }
  }
  return false;
}

function decodeWebhookSecret(secret: string): Buffer | null {
  // Accept both `v1,whsec_<base64>` (Supabase config format) and the raw
  // base64 value, so tests can wire it up without faking the prefix.
  let raw = secret;
  if (raw.startsWith('v1,')) raw = raw.slice(3);
  if (raw.startsWith('whsec_')) raw = raw.slice('whsec_'.length);
  return safeBase64Decode(raw);
}

function safeBase64Decode(value: string): Buffer | null {
  // Buffer.from silently drops non-base64 chars rather than throwing, so an
  // empty buffer is the only signal that the input was unusable.
  const buf = Buffer.from(value, 'base64');
  return buf.length === 0 ? null : buf;
}
