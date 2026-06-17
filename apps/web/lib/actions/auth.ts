'use server';

import { cookies } from 'next/headers';
import { z } from 'zod';
import { getUserClient } from '@template/db';
import { env } from '@template/env/web';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

export async function loginAction(
  input: z.infer<typeof loginSchema>,
): Promise<ActionResult<{ userId: string }>> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid email or password' };

  const supabase = getUserClient({
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    cookies: await cookieAdapter(),
  });

  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return { ok: false, error: error?.message ?? 'Sign-in failed' };

  return { ok: true, data: { userId: data.user.id } };
}

async function cookieAdapter() {
  const cookieStore = await cookies();
  return {
    getAll: () => cookieStore.getAll(),
    setAll: (cs: { name: string; value: string; options?: Record<string, unknown> }[]) => {
      for (const c of cs) cookieStore.set(c.name, c.value, c.options ?? {});
    },
  };
}
