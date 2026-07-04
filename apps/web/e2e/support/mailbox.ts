import type { APIRequestContext } from '@playwright/test';

// Shared mail-catcher client for the auth E2E suite.
//
// The Supabase local stack ships **Mailpit** (the container is historically
// named `supabase_inbucket_*`, but the image is `supabase/mailpit`). Mailpit's
// HTTP API is NOT the legacy InBucket `/api/v1/mailbox/{name}` shape — it is:
//   * GET  /api/v1/search?query=to:<addr>  → { messages: [{ ID, To, Subject, Created }] }
//   * GET  /api/v1/message/{ID}            → { HTML, Text, To, Subject, ... }
//   * DELETE /api/v1/messages              → purge the mailbox
// Newest messages come first. `supabase status` exposes the URL as both
// INBUCKET_URL and MAILPIT_URL (same port, default 54424).
//
// INVARIANT: auth emails link to `NEXT_PUBLIC_SITE_URL` (the hook builds the
// `/auth/confirm` URL from it). E2E must therefore run with
// `E2E_BASE_URL === NEXT_PUBLIC_SITE_URL` so the confirm link and the test's
// session cookie share an origin. Locally that's `https://template.localhost`
// (the portless dev proxy); in CI it's whatever the prod-build server serves.

const MAILPIT_URL =
  process.env.MAILPIT_URL ?? process.env.INBUCKET_URL ?? 'http://127.0.0.1:54424';

type MailpitAddress = { Address: string; Name?: string };
type MailpitSummary = { ID: string; To: MailpitAddress[]; Subject: string; Created: string };
type MailpitMessage = { HTML?: string; Text?: string; To: MailpitAddress[]; Subject: string };

const EMAIL_OTP_TYPES = ['signup', 'recovery', 'invite', 'email_change', 'magiclink'] as const;
export type EmailOtpType = (typeof EMAIL_OTP_TYPES)[number];

export type WaitForAuthLinkOptions = {
  request: APIRequestContext;
  /** Recipient mailbox to poll — distinguishes the old vs new address in the
   *  email-change double-confirm, where both messages share `type`. */
  email: string;
  /** Which confirm `type` to match in the link's query string. */
  type: EmailOtpType;
  /** How long to poll before giving up. Supabase fires the send-email hook
   *  synchronously but Mailpit indexing can lag a beat. */
  timeoutMs?: number;
};

/**
 * Poll the recipient's Mailpit mailbox until an `/auth/confirm` link of the
 * requested `type` appears, and return it as an absolute URL. Throws with a
 * diagnostic if none arrives before `timeoutMs`.
 *
 * Pair with a per-run-unique recipient address so a stale link from an
 * earlier run can never be returned.
 */
export async function waitForAuthLink({
  request,
  email,
  type,
  timeoutMs = 30_000,
}: WaitForAuthLinkOptions): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let lastError = '';
  while (Date.now() < deadline) {
    for (const id of await messageIdsTo(request, email)) {
      const link = await extractAuthLink(request, id, type).catch((e) => {
        lastError = String(e);
        return undefined;
      });
      if (link) return link;
    }
    await sleep(500);
  }
  throw new Error(
    `No ${type} email for ${email} in Mailpit within ${timeoutMs}ms` +
      (lastError ? ` (last error: ${lastError})` : ''),
  );
}

/** Message IDs addressed to `email`, newest-first. */
async function messageIdsTo(request: APIRequestContext, email: string): Promise<string[]> {
  const res = await request.get(
    `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=50`,
  );
  if (!res.ok()) return [];
  const body = (await res.json()) as { messages?: MailpitSummary[] };
  const summaries = body.messages ?? [];
  // Belt-and-braces: the search is a substring match, so confirm the exact
  // recipient before trusting a hit.
  return summaries
    .filter((m) => m.To?.some((t) => t.Address.toLowerCase() === email.toLowerCase()))
    .map((m) => m.ID);
}

async function extractAuthLink(
  request: APIRequestContext,
  id: string,
  type: EmailOtpType,
): Promise<string | undefined> {
  const res = await request.get(`${MAILPIT_URL}/api/v1/message/${id}`);
  if (!res.ok()) return undefined;
  const body = (await res.json()) as MailpitMessage;
  const source = decodeEntities(body.HTML ?? body.Text ?? '');
  const re = new RegExp(`https?://[^"'\\s<>]+/auth/confirm[^"'\\s<>]*type=${type}[^"'\\s<>]*`);
  const match = source.match(re);
  return match?.[0];
}

/** Empty the whole mailbox — call in beforeAll for a clean slate if a spec
 *  asserts on message counts rather than unique recipients. */
export async function purgeMailbox(request: APIRequestContext): Promise<void> {
  await request.delete(`${MAILPIT_URL}/api/v1/messages`);
}

/** Count of messages currently addressed to `email`. Lets a spec assert that
 *  "resend" actually produced an additional message. */
export async function messageCountTo(request: APIRequestContext, email: string): Promise<number> {
  return (await messageIdsTo(request, email)).length;
}

// Mail HTML entity-encodes the ampersands in query strings (`&amp;`). Decode
// the handful that show up in an `/auth/confirm?...` URL so the link parses.
function decodeEntities(html: string): string {
  return html
    .replace(/&amp;/g, '&')
    .replace(/&#38;/g, '&')
    .replace(/&#x26;/gi, '&');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
