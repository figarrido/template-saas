import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Button } from '@template/ui';
import { resolveAdminGate } from '@/lib/auth/gate';

export default async function AdminIndex() {
  const gate = await resolveAdminGate();

  if (!gate.ok) {
    if (gate.reason === 'enroll') redirect('/enroll');
    if (gate.reason === 'challenge') redirect('/challenge');
    notFound();
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-3xl font-bold">Admin</h1>
      <p className="mt-4 text-muted-foreground">Internal admin surface.</p>
      <div className="mt-6">
        <Button asChild>
          <Link href="/organizations">Organizations</Link>
        </Button>
      </div>
    </main>
  );
}
