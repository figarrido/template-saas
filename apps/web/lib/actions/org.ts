'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  createOrganizationSchema,
  invalidInputFirstIssue,
  ACTIVE_ORG_COOKIE,
  AUTH_MESSAGES,
  type CreateOrganizationInput,
  type ActionResult,
} from '@template/auth';
import { getRequestClient } from '@/lib/supabase/server';

// Thin adapter (docs/architecture/09-api-boundary.md § Server Actions): validate
// with the shared schema, delegate the write to the create_organization RPC
// through the RLS user client (never the service client), set the active-org
// cookie, and redirect to the new org's dashboard. All slug/collision logic
// lives in the RPC.
export async function createOrganizationAction(
  input: CreateOrganizationInput,
): Promise<ActionResult<never>> {
  const parsed = createOrganizationSchema.safeParse(input);
  if (!parsed.success) return invalidInputFirstIssue(parsed.error);

  const supabase = await getRequestClient();
  // @supabase/ssr@0.5.2 passes Schema as the 3rd SupabaseClient generic, but
  // supabase-js@2.108.x moved it to the 4th, so Schema resolves to never and
  // rpc() loses its Args type. Cast the single arg to bypass the mismatch.
  const { data, error } = await supabase.rpc(
    'create_organization',
    { org_name: parsed.data.name } as never,
  );

  // Robust to typegen emitting the composite as a row or a 1-element set.
  const org = (Array.isArray(data) ? data[0] : data) as
    | { organization_id: string; slug: string }
    | null
    | undefined;

  if (error || !org) {
    return { ok: false, error: AUTH_MESSAGES.unexpected, code: 'unexpected' };
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, org.organization_id, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });

  redirect(`/${org.slug}/dashboard`);
}
