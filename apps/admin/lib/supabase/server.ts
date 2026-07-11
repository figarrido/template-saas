import { getUserClient, type UserClient } from '@template/db';
import { env } from '@template/env/admin';
import { cookieAdapter } from './cookie-adapter.js';

// Builds the cookie-bound, RLS-honoring Supabase client used by Server
// Actions, Route Handlers, and RSC data helpers in apps/admin.

export async function getRequestClient(): Promise<UserClient> {
  return getUserClient({
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    supabasePublishableKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    cookies: await cookieAdapter(),
  });
}
