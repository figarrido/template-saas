// Injectable Supabase MFA wrappers for Operator sign-in (apps/admin).
// All Supabase client.auth.mfa.* calls are centralized here so route and
// action files never scatter raw MFA API calls. ADR 0006.

import type { AssuranceLevel } from '../middleware-helpers.js';
import { AUTH_MESSAGES } from './messages.js';
import type { ActionResult, AuthClient } from './types.js';

export async function getAdminAssurance(
  client: AuthClient,
): Promise<{ currentLevel: AssuranceLevel | null; nextLevel: AssuranceLevel | null }> {
  const { data } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  return {
    currentLevel: (data?.currentLevel as AssuranceLevel | null | undefined) ?? null,
    nextLevel: (data?.nextLevel as AssuranceLevel | null | undefined) ?? null,
  };
}

export async function getAdminTotpFactor(
  client: AuthClient,
): Promise<{ factorId: string | null; verified: boolean }> {
  const { data } = await client.auth.mfa.listFactors();
  const factors = data?.totp ?? [];
  const verified = factors.find((f) => f.status === 'verified');
  if (verified) return { factorId: verified.id, verified: true };
  const unverified = factors[0];
  if (unverified) return { factorId: unverified.id, verified: false };
  return { factorId: null, verified: false };
}

export async function enrollAdminTotp(
  client: AuthClient,
): Promise<ActionResult<{ factorId: string; qrCode: string; secret: string; uri: string }>> {
  // Clean stale unverified factors before enrolling a fresh one.
  const { data: listData } = await client.auth.mfa.listFactors();
  for (const factor of listData?.totp ?? []) {
    if (factor.status !== 'verified') {
      await client.auth.mfa.unenroll({ factorId: factor.id });
    }
  }

  const { data, error } = await client.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'Operator TOTP',
  });

  if (error || !data) {
    return { ok: false, error: AUTH_MESSAGES.unexpected, code: 'unexpected' };
  }

  return {
    ok: true,
    data: {
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
      uri: data.totp.uri,
    },
  };
}

export async function verifyAdminTotp(
  client: AuthClient,
  input: { factorId: string; code: string },
): Promise<ActionResult> {
  const { error } = await client.auth.mfa.challengeAndVerify({
    factorId: input.factorId,
    code: input.code,
  });

  if (error) {
    return { ok: false, error: AUTH_MESSAGES.invalidCredentials, code: 'invalid-credentials' };
  }

  return { ok: true, data: undefined };
}
