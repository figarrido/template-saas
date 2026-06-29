// Supabase Auth → React Email seam (ADR-0005). Supabase POSTs here when
// it needs to send a verification / recovery / email-change message; we
// verify the Standard Webhooks signature, render the matching React Email
// template, and dispatch via the selected EmailProvider (Resend in prod,
// SMTP → InBucket in dev).
//
// The actual logic lives in `packages/email/src/hooks/send-email.ts` so it
// can be unit-tested without spinning up Next. This file is only the
// HTTP adapter.

import { NextResponse, type NextRequest } from 'next/server';
import { selectEmailProvider } from '@template/email';
import { handleSendEmailHook } from '@template/email/hooks/send-email';
import { env } from '@template/env/web';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const secret = env.SEND_EMAIL_HOOK_SECRET;
  if (!secret) {
    // Misconfiguration — fail closed so Supabase retries are visible in
    // the platform's hook-delivery log rather than silently dropping mail.
    return new NextResponse('SEND_EMAIL_HOOK_SECRET not set', { status: 500 });
  }

  const rawBody = await req.text();
  const result = await handleSendEmailHook(
    rawBody,
    {
      id: req.headers.get('webhook-id'),
      timestamp: req.headers.get('webhook-timestamp'),
      signature: req.headers.get('webhook-signature'),
    },
    {
      secret,
      siteUrl: env.NEXT_PUBLIC_SITE_URL,
      from: env.AUTH_EMAIL_FROM,
      provider: selectEmailProvider(),
    },
  );

  if (!result.ok) {
    return new NextResponse(result.error, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
