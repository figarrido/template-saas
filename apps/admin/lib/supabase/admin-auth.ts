import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@template/env/admin';

let _client: SupabaseClient | undefined;
export function getAdminAuthClient(): SupabaseClient {
  _client ??= createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _client;
}
