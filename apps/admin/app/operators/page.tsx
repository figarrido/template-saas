import { PageHeader, Card, CardContent, EmptyState } from '@template/ui';
import { requireOperator } from '@/lib/auth/gate';
import { listPendingOperatorInvitations } from '@/lib/data/operator-invitations';
import { InviteOperatorForm } from './invite-form';

export default async function OperatorsPage() {
  await requireOperator();

  const pending = await listPendingOperatorInvitations();

  return (
    <main className="mx-auto max-w-4xl p-6">
      <PageHeader title="Operators" description="Manage operator access" />

      <div className="mt-6">
        <InviteOperatorForm />
      </div>

      <Card className="mt-6">
        <CardContent className="p-0">
          {pending.length === 0 ? (
            <EmptyState title="No pending invitations" description="Invited operators will appear here." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Invited</th>
                  <th className="px-4 py-3 font-medium">Expires</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((inv) => (
                  <tr key={inv.email} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="px-4 py-3">{inv.email}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(inv.invitedAt).toISOString().slice(0, 10)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(inv.expiresAt).toISOString().slice(0, 10)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
