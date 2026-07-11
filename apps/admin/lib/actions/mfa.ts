'use server';

import { z } from 'zod';
import { cookies } from 'next/headers';
import {
  AUTH_MESSAGES,
  enrollAdminTotp,
  generateRecoveryCodes,
  hashRecoveryCode,
  readJwtSessionId,
  signRecoveryElevation,
  verifyAdminTotp,
  ADMIN_RECOVERY_ELEVATION_COOKIE,
  type ActionResult,
} from '@template/auth';
import { env } from '@template/env/admin';
import { getRequestClient } from '@/lib/supabase/server';
import { storeRecoveryCodes, redeemRecoveryCode } from '@/lib/data/mfa';

const factorIdSchema = z.object({ factorId: z.string().min(1), code: z.string().min(6) });
const codeOnlySchema = z.object({ code: z.string().min(1) });

export async function confirmEnrollmentAction(
  input: { factorId: string; code: string },
): Promise<ActionResult<{ recoveryCodes: string[] }>> {
  const parsed = factorIdSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: AUTH_MESSAGES.invalidCredentials, code: 'invalid-credentials' };
  }

  const client = await getRequestClient();
  const verified = await verifyAdminTotp(client, parsed.data);
  if (!verified.ok) return verified;

  const { data: userData } = await client.auth.getUser();
  if (!userData.user) {
    return { ok: false, error: AUTH_MESSAGES.unexpected, code: 'unexpected' };
  }

  const codes = generateRecoveryCodes();
  const hashes = await Promise.all(codes.map(hashRecoveryCode));
  await storeRecoveryCodes(userData.user.id, hashes);

  return { ok: true, data: { recoveryCodes: codes } };
}

export async function verifyChallengeAction(
  input: { factorId: string; code: string },
): Promise<ActionResult> {
  const parsed = factorIdSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: AUTH_MESSAGES.invalidCredentials, code: 'invalid-credentials' };
  }
  return verifyAdminTotp(await getRequestClient(), parsed.data);
}

export async function redeemRecoveryCodeAction(
  input: { code: string },
): Promise<ActionResult> {
  const parsed = codeOnlySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: AUTH_MESSAGES.invalidCredentials, code: 'invalid-credentials' };
  }

  const client = await getRequestClient();
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) {
    return { ok: false, error: AUTH_MESSAGES.unexpected, code: 'unexpected' };
  }

  const codeHash = await hashRecoveryCode(parsed.data.code);
  const ok = await redeemRecoveryCode(userData.user.id, codeHash);
  if (!ok) {
    return { ok: false, error: AUTH_MESSAGES.invalidCredentials, code: 'invalid-credentials' };
  }

  const { data: sessionData } = await client.auth.getSession();
  const sessionId = readJwtSessionId(sessionData.session?.access_token);
  if (!sessionId) {
    return { ok: false, error: AUTH_MESSAGES.unexpected, code: 'unexpected' };
  }

  const value = await signRecoveryElevation(
    env.SUPABASE_SERVICE_ROLE_KEY,
    userData.user.id,
    sessionId,
  );

  (await cookies()).set(ADMIN_RECOVERY_ELEVATION_COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 8,
  });

  return { ok: true, data: undefined };
}
