import { NextResponse, type NextRequest } from 'next/server';
import { destinationForOrganizations, exchangeOAuthCode } from '@template/auth';
import { getRequestClient } from '@/lib/supabase/server';
import { getMyOrganizations } from '@/lib/data/org';

// Issue #8 — OAuth callback. The provider redirects the browser back here
// with a PKCE `?code=...`; we exchange it for a Session via the cookie-bound
// client (so the Set-Cookie persists onto this response) and then route by
// Organization count, exactly like the email/password sign-in path.
//
// The seam ships dormant: with every provider in `packages/auth`
// disabled, /auth/callback is never reached during normal flow. Lives at a
// fixed top-level path so the same URL can be registered as a redirect URI
// with the OAuth provider regardless of which derived project enables it.

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.redirect(new URL('/login?error=oauth', req.url));
  }

  const client = await getRequestClient();
  const result = await exchangeOAuthCode(client, code);
  if (!result.ok) {
    return NextResponse.redirect(new URL('/login?error=oauth', req.url));
  }

  const memberships = await getMyOrganizations();
  const orgs = memberships
    .map((m) => (m.organizations ? { slug: m.organizations.slug } : null))
    .filter((x): x is { slug: string } => x !== null);
  const destination = destinationForOrganizations(orgs);
  return NextResponse.redirect(new URL(destination.path, req.url));
}
