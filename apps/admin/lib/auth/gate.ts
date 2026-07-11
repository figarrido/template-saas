import 'server-only';
import { cookies } from 'next/headers';
import {
  gateAdmin,
  getAdminAssurance,
  readJwtSessionId,
  verifyRecoveryElevation,
  ADMIN_RECOVERY_ELEVATION_COOKIE,
  type AdminGateResult,
} from '@template/auth';
import { env } from '@template/env/admin';
import { getRequestClient } from '@/lib/supabase/server';
import { lookupAdminStatus } from '@/lib/data/admin';

export async function resolveAdminGate(): Promise<AdminGateResult> {
  const supabase = await getRequestClient();
  const { data: userData } = await supabase.auth.getUser();
  const session = { user: userData.user ? { id: userData.user.id } : null };
  if (!session.user) {
    return gateAdmin(session, {
      isAdmin: false,
      currentLevel: null,
      nextLevel: null,
      recoveryElevated: false,
    });
  }

  const isAdmin = await lookupAdminStatus(session.user.id);
  const { currentLevel, nextLevel } = await getAdminAssurance(supabase);

  let recoveryElevated = false;
  if (currentLevel !== 'aal2' && nextLevel === 'aal2') {
    const { data: sessionData } = await supabase.auth.getSession();
    const sessionId = readJwtSessionId(sessionData.session?.access_token);
    const cookie = (await cookies()).get(ADMIN_RECOVERY_ELEVATION_COOKIE)?.value ?? null;
    if (sessionId) {
      recoveryElevated = await verifyRecoveryElevation(
        env.SUPABASE_SERVICE_ROLE_KEY,
        session.user.id,
        sessionId,
        cookie,
      );
    }
  }

  return gateAdmin(session, { isAdmin, currentLevel, nextLevel, recoveryElevated });
}
