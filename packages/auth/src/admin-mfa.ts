// Pure crypto helpers for Operator MFA recovery codes and elevation cookies.
// Edge-safe: uses only Web Crypto (crypto.subtle, crypto.getRandomValues).
// ADR 0006 recovery ladder rung 1.

export const RECOVERY_CODE_COUNT = 10;
export const ADMIN_RECOVERY_ELEVATION_COOKIE = 'admin_recovery_aal2';

// Crockford-base32-ish: no ambiguous 0/1/O/I characters.
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  const codes = new Set<string>();
  while (codes.size < count) {
    const bytes = new Uint8Array(10);
    crypto.getRandomValues(bytes);
    const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]);
    codes.add(`${chars.slice(0, 5).join('')}-${chars.slice(5).join('')}`);
  }
  return Array.from(codes);
}

export function normalizeRecoveryCode(input: string): string {
  return input.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

export async function hashRecoveryCode(code: string): Promise<string> {
  const normalized = normalizeRecoveryCode(code);
  const encoded = new TextEncoder().encode(normalized);
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function readJwtSessionId(accessToken: string | null | undefined): string | null {
  try {
    if (!accessToken) return null;
    const parts = accessToken.split('.');
    if (parts.length < 2) return null;
    const payload = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '=='.slice((payload.length + 3) % 4 || 4);
    const json = atob(padded);
    const parsed = JSON.parse(json) as Record<string, unknown>;
    const sessionId = parsed['session_id'];
    return typeof sessionId === 'string' ? sessionId : null;
  } catch {
    return null;
  }
}

async function hmacKey(secret: string) {
  const keyBytes = new TextEncoder().encode(secret);
  return crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

function base64urlEncode(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64urlDecode(str: string): ArrayBuffer | null {
  try {
    const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice((str.length + 3) % 4 || 4);
    const binary = atob(padded);
    const buf = new ArrayBuffer(binary.length);
    const view = new Uint8Array(buf);
    for (let i = 0; i < binary.length; i++) {
      view[i] = binary.charCodeAt(i);
    }
    return buf;
  } catch {
    return null;
  }
}

export async function signRecoveryElevation(
  secret: string,
  userId: string,
  sessionId: string,
): Promise<string> {
  const key = await hmacKey(secret);
  const message = new TextEncoder().encode(`${userId}.${sessionId}`);
  const sig = await crypto.subtle.sign('HMAC', key, message);
  return base64urlEncode(sig);
}

export async function verifyRecoveryElevation(
  secret: string,
  userId: string,
  sessionId: string,
  cookieValue: string | null | undefined,
): Promise<boolean> {
  if (!cookieValue || !userId || !sessionId) return false;
  const sigBytes = base64urlDecode(cookieValue);
  if (!sigBytes) return false;
  try {
    const key = await hmacKey(secret);
    const message = new TextEncoder().encode(`${userId}.${sessionId}`);
    return await crypto.subtle.verify('HMAC', key, sigBytes, message);
  } catch {
    return false;
  }
}
