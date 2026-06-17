import { cache } from 'react';
import { cookies } from 'next/headers';
import { getUserClient } from '@template/db';
import { env } from '@template/env/web';

// Read-side helper for RSC. cache() memoizes per-request so multiple
// components asking for the active org share one round-trip.
export const getMyOrganizations = cache(async () => {
  const supabase = getUserClient({
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    cookies: await cookieAdapter(),
  });

  const { data, error } = await supabase
    .from('memberships')
    .select('organization_id, role, organizations(name, slug)');
  if (error) throw error;
  return data;
});

async function cookieAdapter() {
  const cookieStore = await cookies();
  return {
    getAll: () => cookieStore.getAll(),
    setAll: (cs: { name: string; value: string; options?: Record<string, unknown> }[]) => {
      for (const c of cs) cookieStore.set(c.name, c.value, c.options ?? {});
    },
  };
}
