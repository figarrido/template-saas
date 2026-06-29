import { AUTH_MESSAGES } from './messages.js';
import type { ActionResult, AuthClient } from './types.js';

export type SignOutResult = ActionResult;

/**
 * End the current device's Session. Uses `scope: 'local'` so other devices
 * stay signed in — issue #3 acceptance criterion: "Sign-out ends only the
 * current device's Session; other Sessions remain valid."
 */
export async function signOut(client: AuthClient): Promise<SignOutResult> {
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (error) {
    return { ok: false, error: AUTH_MESSAGES.unexpected, code: 'unexpected' };
  }
  return { ok: true, data: undefined };
}
