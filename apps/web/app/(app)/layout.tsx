import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getRequestClient } from '@/lib/supabase/server';

// Auth guard for the whole (app) route group. Per docs/architecture/03-auth.md
// and mirroring apps/admin's gateAdmin, the session check lives in a server
// component — not middleware, which in this repo only sets CSP + base headers.
//
// getClaims() (not getUser) verifies the access token locally against the
// project's JWKS when asymmetric signing keys are enabled — no round-trip to
// the Auth server per request — and refreshes an about-to-expire session
// before returning. `data` is null for a missing, expired-and-unrefreshable,
// or otherwise invalid session; that user is unauthenticated, so bounce to
// /login. This is what stops an unauthenticated render — e.g. the RSC re-render
// Next.js runs immediately after a sign-out Server Action clears the auth
// cookies — from reaching an RLS-scoped query (getMyOrganizations) as the anon
// role and throwing "permission denied for table memberships".
export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await getRequestClient();
  const { data } = await supabase.auth.getClaims();
  if (!data) redirect('/login');

  return <>{children}</>;
}
