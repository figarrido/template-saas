import { NextResponse, type NextRequest } from 'next/server';
import { generateCspNonce } from '@template/auth';

// Admin middleware is stricter than web. docs/architecture/03-auth.md
// § Admin enforcement: failure returns 404, not 403. The actual session
// + admin_users + MFA check runs inside server components / route
// handlers via the @template/auth gateAdmin helper — middleware here
// only handles CSP + base headers (the full chain needs DB lookups that
// middleware can't perform on the edge).
export function middleware(req: NextRequest) {
  const nonce = generateCspNonce();
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-csp-nonce', nonce);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set('content-security-policy', csp);
  return res;
}

function buildCsp(nonce: string): string {
  // Next.js dev serves the client runtime via webpack `eval()` and Fast Refresh,
  // both of which need `'unsafe-eval'`. Without it the strict CSP blocks the
  // client bundle from executing and the page never hydrates. Emit it in dev
  // only; production runs without eval and must keep the strict policy.
  const scriptSrc =
    process.env.NODE_ENV === 'production'
      ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
      : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`;

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co https://*.sentry.io",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
  ].join('; ');
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
