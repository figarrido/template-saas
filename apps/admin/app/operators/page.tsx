import { PageHeader, Heading } from '@template/ui';
import { requireOperator } from '@/lib/auth/gate';
import { getAdminDb } from '@/lib/data/db';
import { listOperators } from '@/lib/data/operators';
import { listPendingOperatorInvitations } from '@/lib/data/operator-invitations';
import { InviteOperatorForm } from './invite-form';
import { OperatorsTable } from './operators-table';
import { PendingInvitationsTable } from './pending-invitations-table';

export default async function OperatorsPage() {
  const currentUserId = await requireOperator();
  const db = getAdminDb();
  const [operators, pending] = await Promise.all([
    listOperators(db),
    listPendingOperatorInvitations(db),
  ]);

  return (
    <main className="mx-auto max-w-4xl p-6">
      <PageHeader title="Operators" description="Manage operator access" />

      <div className="mt-6">
        <InviteOperatorForm />
      </div>

      <Heading className="mt-8 text-lg">Operators</Heading>
      <div className="mt-3">
        <OperatorsTable operators={operators} currentUserId={currentUserId} />
      </div>

      <Heading className="mt-8 text-lg">Pending invitations</Heading>
      <div className="mt-3">
        <PendingInvitationsTable invitations={pending} />
      </div>
    </main>
  );
}
