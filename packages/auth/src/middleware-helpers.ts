// Helpers shared by `apps/web` and `apps/admin` middleware. Compose them
// differently per app — never share a single middleware.ts.
//
// docs/architecture/03-auth.md § Admin enforcement: failures return 404,
// not 403, so the admin surface gives away nothing to a probing client.

export const ACTIVE_ORG_COOKIE = 'active_organization_id';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readActiveOrgFromCookie(cookieValue: string | undefined | null): string | null {
  if (!cookieValue) return null;
  return UUID_RE.test(cookieValue) ? cookieValue : null;
}

export type SessionLike = { user: { id: string } | null };

export type AssuranceLevel = 'aal1' | 'aal2';

export type AdminCheck = {
  isAdmin: boolean;
  currentLevel: AssuranceLevel | null; // Supabase getAuthenticatorAssuranceLevel().currentLevel
  nextLevel: AssuranceLevel | null;    // .nextLevel — 'aal2' iff a *verified* factor exists
  recoveryElevated: boolean;           // app-managed: valid recovery-elevation cookie for this session
};

export type AdminGateResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'no-session' | 'not-admin' | 'enroll' | 'challenge' };

/**
 * AAL-aware admin gate (ADR 0006). Order:
 *   1. session present?            no  → 'no-session' (404)
 *   2. in admin_users?             no  → 'not-admin'  (404)
 *   3. session already aal2        yes → ok
 *   4. verified factor exists (nextLevel==='aal2')?
 *        recovery-elevated this session → ok
 *        else                           → 'challenge'
 *   5. no verified factor          → 'enroll'
 */
export function gateAdmin(session: SessionLike, check: AdminCheck): AdminGateResult {
  if (!session.user) return { ok: false, reason: 'no-session' };
  if (!check.isAdmin) return { ok: false, reason: 'not-admin' };
  if (check.currentLevel === 'aal2') return { ok: true, userId: session.user.id };
  if (check.nextLevel === 'aal2') {
    if (check.recoveryElevated) return { ok: true, userId: session.user.id };
    return { ok: false, reason: 'challenge' };
  }
  return { ok: false, reason: 'enroll' };
}

/**
 * Cryptographically-strong nonce for CSP. Both apps build a per-request
 * nonce in middleware and pipe it through `headers().get('x-csp-nonce')`.
 */
export function generateCspNonce(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  let s = '';
  for (const byte of buf) s += String.fromCharCode(byte);
  return btoa(s);
}
