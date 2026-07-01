import { NextResponse, type NextRequest } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { ACTIVE_ORG_COOKIE, generateCspNonce, readActiveOrgFromCookie } from '@template/auth';

// Per-request CSP nonce + rate-limit + active-org cookie validation.
// docs/architecture/09-api-boundary.md § Rate limiting.

const ratelimit =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Ratelimit({
        redis: Redis.fromEnv(),
        limiter: Ratelimit.slidingWindow(60, '60 s'),
        analytics: false,
      })
    : null;

const RATE_LIMITED_PATHS = ['/api/', '/auth/'];
const RATE_LIMIT_BYPASS = ['/api/webhooks/'];

export async function middleware(req: NextRequest) {
  const url = req.nextUrl;

  // Rate limit — webhooks bypass (signature verification protects them).
  if (
    ratelimit &&
    RATE_LIMITED_PATHS.some((p) => url.pathname.startsWith(p)) &&
    !RATE_LIMIT_BYPASS.some((p) => url.pathname.startsWith(p))
  ) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const { success, reset } = await ratelimit.limit(`api:${ip}:${url.pathname}`);
    if (!success) {
      return new NextResponse('Too many requests', {
        status: 429,
        headers: { 'retry-after': String(Math.ceil((reset - Date.now()) / 1000)) },
      });
    }
  }

  // CSP nonce per request, piped to pages via x-csp-nonce.
  const nonce = generateCspNonce();
  const cspHeader = buildCsp(nonce);

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-csp-nonce', nonce);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set('content-security-policy', cspHeader);

  // Active-org cookie validation — repair bad values rather than fail loudly.
  const cookie = req.cookies.get(ACTIVE_ORG_COOKIE)?.value;
  if (cookie && !readActiveOrgFromCookie(cookie)) {
    res.cookies.delete(ACTIVE_ORG_COOKIE);
  }

  return res;
}

function buildCsp(nonce: string): string {
  // Next.js dev serves the client runtime via webpack `eval()` and Fast Refresh,
  // both of which need `'unsafe-eval'`. Without it the strict CSP blocks the
  // client bundle from executing, the page never hydrates, and forms fall back
  // to a native (non-JS) submit — e.g. login silently GETs instead of running
  // the Server Action. Emit it in dev only; production runs without eval and
  // must keep the strict policy.
  const scriptSrc =
    process.env.NODE_ENV === 'production'
      ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
      : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`;

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co https://*.posthog.com https://*.sentry.io",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
  ].join('; ');
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
