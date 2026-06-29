import { cookies } from 'next/headers';
import type { CookieAdapter } from '@template/db';

// Bridges Next's async cookies() API to the small CookieAdapter shape that
// `getUserClient` expects. Reused by Server Actions, RSC data helpers, and
// Route Handlers so the cookie wiring lives in exactly one place.

export async function cookieAdapter(): Promise<CookieAdapter> {
  const cookieStore = await cookies();
  return {
    getAll: () => cookieStore.getAll(),
    setAll: (cs) => {
      for (const c of cs) cookieStore.set(c.name, c.value, c.options ?? {});
    },
  };
}
