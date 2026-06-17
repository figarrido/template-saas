import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { getUserClient } from '@template/db';
import { gateAdmin } from '@template/auth';
import { env } from '@template/env/admin';
import { lookupAdminStatus } from '@/lib/data/admin';

// Apply gateAdmin per docs/architecture/03-auth.md. The MFA check is
// stubbed until apps/admin gets a real enrolment flow.
export default async function AdminIndex() {
  const supabase = getUserClient({
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    cookies: await cookieAdapter(),
  });
  const { data } = await supabase.auth.getUser();
  const session = { user: data.user ? { id: data.user.id } : null };

  const isAdmin = session.user ? await lookupAdminStatus(session.user.id) : false;
  // MFA stub — real implementation checks Supabase Auth amr / aal2.
  const mfaVerified = isAdmin;

  const gate = gateAdmin(session, { isAdmin, mfaVerified });
  if (!gate.ok) notFound();

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-3xl font-bold">Admin</h1>
      <p className="mt-4 text-muted-foreground">Internal admin surface.</p>
    </main>
  );
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
