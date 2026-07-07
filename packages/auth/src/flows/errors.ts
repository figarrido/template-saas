// Shared error-shape predicates for mapping Supabase Auth errors onto the
// flow ActionResult codes. Lives here so sign-up, change-password, and the
// next slice's reset-password flow can share one definition.

export type SupabaseAuthError = { code?: string | undefined; message?: string };

/**
 * Supabase signals a policy/HIBP rejection with `code: 'weak_password'`.
 * Older supabase-js versions only populate the message, so we fall back to
 * a defensive regex match on it.
 */
export function isWeakPasswordError(error: SupabaseAuthError): boolean {
  if (error.code === 'weak_password') return true;
  const message = error.message ?? '';
  return /password/i.test(message) && /(weak|breach|short|leaked|pwned)/i.test(message);
}

/**
 * True when Supabase rejected a sign-up because the address is already
 * registered. Newer GoTrue versions return a hard `user_already_exists`
 * (HTTP 422) for an existing *confirmed* account instead of the obfuscated
 * empty-`identities` user older versions returned — the sign-up flow collapses
 * both onto the same generic success so neither leaks account existence
 * (ADR-0002).
 */
export function isUserAlreadyExistsError(error: SupabaseAuthError): boolean {
  if (error.code === 'user_already_exists' || error.code === 'email_exists') return true;
  const message = error.message ?? '';
  return /already\s+(registered|exists)/i.test(message);
}
