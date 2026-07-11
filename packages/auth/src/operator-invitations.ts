// Pure crypto helpers for Operator invitation tokens.
// Edge-safe: uses only Web Crypto (crypto.subtle, crypto.getRandomValues).
// ADR 0006 invitation-based Operator onboarding.

export const OPERATOR_INVITATION_TTL_DAYS = 7;

export type OperatorInvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

// 32 random bytes → base64url (URL-safe, no padding). Opaque; not normalized.
export function generateOperatorInvitationToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// SHA-256 hex of the raw token (NO normalization — the token is opaque, unlike
// recovery codes). Same hex style as hashRecoveryCode in admin-mfa.ts.
export async function hashOperatorInvitationToken(token: string): Promise<string> {
  const encoded = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// now + 7 days.
export function operatorInvitationExpiry(now: Date): Date {
  const expiry = new Date(now.getTime());
  expiry.setDate(expiry.getDate() + OPERATOR_INVITATION_TTL_DAYS);
  return expiry;
}

// A pending, not-yet-expired invitation is acceptable; anything else is not.
export function isOperatorInvitationAcceptable(
  record: { status: OperatorInvitationStatus; expiresAt: string },
  now: Date,
): boolean {
  return record.status === 'pending' && new Date(record.expiresAt).getTime() > now.getTime();
}
