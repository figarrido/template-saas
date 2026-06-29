import { getUserClient, type UserClient } from '@template/db';
import { env } from '@template/env/web';
import { cookieAdapter } from './cookie-adapter.js';

// Builds the cookie-bound, RLS-honoring Supabase client used by Server
// Actions, Route Handlers, and RSC data helpers. Centralizing the env +
// cookie wiring keeps the auth Server Actions a one-liner over the flow.

export async function getRequestClient(): Promise<UserClient> {
  return getUserClient({
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    supabasePublishableKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    cookies: await cookieAdapter(),
  });
}
