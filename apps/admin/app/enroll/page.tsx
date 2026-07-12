import { notFound, redirect } from 'next/navigation';
import { enrollAdminTotp } from '@template/auth';
import { resolveAdminGate } from '@/lib/auth/gate';
import { getRequestClient } from '@/lib/supabase/server';
import { EnrollForm } from './enroll-form';

export default async function EnrollPage() {
  const gate = await resolveAdminGate();

  // A freshly-verified Operator is already aal2 here — this is also the state
  // the route revalidates into right after confirmEnrollmentAction succeeds.
  // We must NOT redirect on aal2: that navigation would tear down the recovery
  // codes the client just received before the Operator can save them (ADR 0006
  // — recovery codes are issued once, at enrollment). Render the form with no
  // enrollment payload; EnrollForm keeps the same position in the tree, so its
  // client-held recovery codes survive the revalidation, and otherwise it just
  // offers a link into the backoffice.
  if (gate.ok) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md">
          <EnrollForm enrollment={null} />
        </div>
      </main>
    );
  }
  if (gate.reason === 'challenge') redirect('/challenge');
  if (gate.reason === 'no-session' || gate.reason === 'not-admin') notFound();

  // Only 'enroll' reason reaches here.
  const client = await getRequestClient();
  const enrolled = await enrollAdminTotp(client);
  if (!enrolled.ok) notFound();

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <EnrollForm
          enrollment={{
            factorId: enrolled.data.factorId,
            qrCode: enrolled.data.qrCode,
            secret: enrolled.data.secret,
          }}
        />
      </div>
    </main>
  );
}
