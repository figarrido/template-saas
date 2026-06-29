// Typed return value for every auth flow function. The shared shape lets
// the Server Action layer in `apps/web` stay a thin adapter: build the
// cookie-bound Supabase client, hand it to the flow, hand the result back to
// the form. docs/architecture/09-api-boundary.md § Server Actions.

import type { SupabaseClient } from '@supabase/supabase-js';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: ActionErrorCode };

// Stable error codes so the UI can branch on them (e.g. show a resend
// affordance for `not-confirmed`) without parsing user-facing strings.
export type ActionErrorCode =
  | 'invalid-credentials'
  | 'not-confirmed'
  | 'invalid-input'
  | 'unexpected';

// `AuthClient` is the subset of supabase-js the flows actually use. Typed
// generically so callers can pass `SupabaseClient<Database>` from `apps/web`
// without a type-level mismatch — the flows only touch `client.auth`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AuthClient = SupabaseClient<any, any, any>;
