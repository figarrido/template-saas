import { notFound, redirect } from 'next/navigation';
import { getAdminTotpFactor } from '@template/auth';
import { resolveAdminGate } from '@/lib/auth/gate';
import { getRequestClient } from '@/lib/supabase/server';
import { ChallengeForm } from './challenge-form';

export default async function ChallengePage() {
  const gate = await resolveAdminGate();

  if (gate.ok) redirect('/');
  if (!gate.ok && gate.reason === 'enroll') redirect('/enroll');
  if (!gate.ok && (gate.reason === 'no-session' || gate.reason === 'not-admin')) notFound();

  // Only 'challenge' reason reaches here.
  const client = await getRequestClient();
  const { factorId } = await getAdminTotpFactor(client);
  if (!factorId) redirect('/enroll');

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <ChallengeForm factorId={factorId} />
      </div>
    </main>
  );
}
