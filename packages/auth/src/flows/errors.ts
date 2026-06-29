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
