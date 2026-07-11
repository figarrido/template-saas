'use server';

import { signIn, signOut, type SignInInput, type SignInResult, type SignOutResult } from '@template/auth';
import { getRequestClient } from '@/lib/supabase/server';

export async function signInAction(input: SignInInput): Promise<SignInResult> {
  return signIn(await getRequestClient(), input);
}

export async function signOutAction(): Promise<SignOutResult> {
  return signOut(await getRequestClient());
}
