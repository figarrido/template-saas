// Shared classifiers for Supabase auth errors. supabase-js sometimes
// populates `code`, sometimes only `message`; older versions only expose
// the string. Match defensively — the integration tests pin the contract.

export function isWeakPasswordError(error: {
  code?: string | undefined;
  message?: string;
}): boolean {
  if (error.code === 'weak_password') return true;
  const message = error.message ?? '';
  return /password/i.test(message) && /(weak|breach|short|leaked|pwned)/i.test(message);
}
