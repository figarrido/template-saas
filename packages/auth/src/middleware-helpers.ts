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

export type AdminCheck = {
  isAdmin: boolean;
  mfaVerified: boolean;
};

export type AdminGateResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'no-session' | 'not-admin' | 'mfa-not-verified' };

/**
 * Apply the admin enforcement chain in order:
 *   1. session present?
 *   2. user is in admin_users (revoked_at IS NULL)?
 *   3. MFA verified within the session lifetime?
 *
 * Any failure resolves to `{ ok: false }`. The caller renders a 404 from a
 * single branch; the reason is for logging only.
 */
export function gateAdmin(session: SessionLike, check: AdminCheck): AdminGateResult {
  if (!session.user) return { ok: false, reason: 'no-session' };
  if (!check.isAdmin) return { ok: false, reason: 'not-admin' };
  if (!check.mfaVerified) return { ok: false, reason: 'mfa-not-verified' };
  return { ok: true, userId: session.user.id };
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
