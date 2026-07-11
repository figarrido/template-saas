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
      try {
        for (const c of cs) cookieStore.set(c.name, c.value, c.options ?? {});
      } catch {
        // `cookies().set` throws when called during a Server Component render:
        // the auth cookies rotate when getClaims()/a query refreshes an
        // about-to-expire session mid-render. Safe to swallow — the refreshed
        // token still serves this render, and the rotated cookies get persisted
        // on the next Server Action / Route Handler pass, where writes are
        // allowed. Those contexts never reach this catch because set() succeeds.
      }
    },
  };
}
