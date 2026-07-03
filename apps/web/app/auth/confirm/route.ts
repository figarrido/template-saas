import { NextResponse, type NextRequest } from 'next/server';
import { isEmailOtpType, verifyEmailToken } from '@template/auth';
import { getRequestClient } from '@/lib/supabase/server';

// Verifies the one-time `token_hash` carried by Supabase auth emails — the
// `{{ .TokenHash }}` template style configured in supabase/config.toml.
// docs/architecture/03-auth.md § Execution model and parent PRD #2:
// links land here so the verify call writes the Session cookies in a
// trusted server context (a Server Action can't because it's a POST).
//
// On success, the verifyOtp call on the cookie-bound client sets the
// auth cookies via the cookieAdapter; we then 303-redirect the User into
// the app via the standard first-login routing.
//
// On failure (expired / already used / malformed link) we redirect to
// /login with a query flag the form picks up to show a "no longer valid"
// message and a resend affordance. We never echo the failure back via a
// raw error string — the wording lives in AUTH_MESSAGES.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const tokenHash = url.searchParams.get('token_hash') ?? '';
  const rawType = url.searchParams.get('type');
  const next = sanitizeNext(url.searchParams.get('next'));

  if (!isEmailOtpType(rawType)) {
    return redirectInvalid(req, rawType);
  }

  const client = await getRequestClient();
  const result = await verifyEmailToken(client, { tokenHash, type: rawType });

  if (!result.ok) {
    return redirectInvalid(req, rawType);
  }

  // Recovery (password reset) lands the User on the set-new-password page;
  // every other type goes to the post-login router which picks the right
  // destination by Organization count.
  const destination = rawType === 'recovery' ? '/reset-password' : (next ?? '/orgs');
  return NextResponse.redirect(new URL(destination, publicOrigin(req)), { status: 303 });
}

// A failed recovery link should send the User to /forgot-password rather
// than the verification-email resend page — they were trying to reset, not
// to confirm. Every other failure (signup, magiclink, email_change) lands
// on /login with the resend-confirm affordance.
function redirectInvalid(req: NextRequest, rawType: string | null): NextResponse {
  if (rawType === 'recovery') {
    const target = new URL('/forgot-password', publicOrigin(req));
    target.searchParams.set('reset', 'invalid');
    return NextResponse.redirect(target, { status: 303 });
  }
  const target = new URL('/login', publicOrigin(req));
  target.searchParams.set('confirm', 'invalid');
  return NextResponse.redirect(target, { status: 303 });
}

// Behind the local portless proxy (and any prod reverse proxy) the public
// origin the browser used lives in x-forwarded-*; req.url only carries the
// internal origin the proxy forwards to (e.g. http://localhost:3000).
// Redirecting against req.url would bounce the freshly-verified User to a
// different origin than the one that just received the Session cookie — and
// to plain http, which drops Secure cookies — logging them straight back out.
// Mirrors requestOrigin() in lib/actions/auth.ts.
function publicOrigin(req: NextRequest): string {
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (!host) return new URL(req.url).origin;
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  return `${proto}://${host}`;
}

// Defensive next-param sanitation: only allow same-origin app paths so an
// attacker can't craft a confirm link that bounces the freshly-signed-in
// User into an attacker-controlled URL. Anything else falls through to the
// default routing destination.
function sanitizeNext(raw: string | null): string | undefined {
  if (!raw) return undefined;
  if (!raw.startsWith('/') || raw.startsWith('//')) return undefined;
  return raw;
}
