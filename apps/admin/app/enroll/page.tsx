import { notFound, redirect } from 'next/navigation';
import { enrollAdminTotp } from '@template/auth';
import { resolveAdminGate } from '@/lib/auth/gate';
import { getRequestClient } from '@/lib/supabase/server';
import { EnrollForm } from './enroll-form';

export default async function EnrollPage() {
  const gate = await resolveAdminGate();

  if (gate.ok) redirect('/');
  if (!gate.ok && gate.reason === 'challenge') redirect('/challenge');
  if (!gate.ok && (gate.reason === 'no-session' || gate.reason === 'not-admin')) notFound();

  // Only 'enroll' reason reaches here.
  const client = await getRequestClient();
  const enrolled = await enrollAdminTotp(client);
  if (!enrolled.ok) notFound();

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <EnrollForm
          factorId={enrolled.data.factorId}
          qrCode={enrolled.data.qrCode}
          secret={enrolled.data.secret}
        />
      </div>
    </main>
  );
}
