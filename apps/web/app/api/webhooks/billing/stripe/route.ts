// IMPORTANT: Stripe webhook signature verification needs the RAW body.
// Do not let any middleware or parser consume req.body before us — we
// `req.text()` directly. Per docs/architecture/04-billing.md.

import { NextResponse, type NextRequest } from 'next/server';
import { StripeProvider } from '@template/billing';
import { env } from '@template/env/web';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

let _provider: StripeProvider | undefined;
function provider(): StripeProvider {
  _provider ??= new StripeProvider({ secretKey: env.STRIPE_SECRET_KEY });
  return _provider;
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get('stripe-signature');
  if (!signature) return new NextResponse('missing signature', { status: 400 });

  const rawBody = await req.text();

  let event;
  try {
    event = await provider().verifyWebhook({
      rawBody,
      signature,
      secret: env.STRIPE_WEBHOOK_SECRET,
    });
  } catch (err) {
    return new NextResponse(`signature mismatch: ${(err as Error).message}`, { status: 400 });
  }

  const normalized = provider().normalizeWebhookEvent(event);
  if (!normalized) return NextResponse.json({ ok: true, ignored: true });

  // The actual handler dispatches into a service-role write path. The
  // template ships the seam; derived projects wire the writer.
  // billingEventHandler(normalized) — TODO once a writer exists.

  return NextResponse.json({ ok: true, type: normalized.type });
}
