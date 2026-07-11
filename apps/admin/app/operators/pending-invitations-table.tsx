'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, Button, EmptyState, toast } from '@template/ui';
import { revokeOperatorInvitationAction } from '@/lib/actions/operators';

type PendingInvitation = {
  operatorInvitationId: string;
  email: string;
  invitedAt: string;
  expiresAt: string;
};

export function PendingInvitationsTable({ invitations }: { invitations: PendingInvitation[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onRevoke(operatorInvitationId: string) {
    startTransition(async () => {
      const result = await revokeOperatorInvitationAction(operatorInvitationId);
      if (!result.ok) return void toast.error(result.error);
      toast.success('Invitation revoked.');
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="p-0">
        {invitations.length === 0 ? (
          <EmptyState title="No pending invitations" description="Invited operators will appear here." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Invited</th>
                <th className="px-4 py-3 font-medium">Expires</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((inv) => (
                <tr key={inv.operatorInvitationId} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-3">{inv.email}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(inv.invitedAt).toISOString().slice(0, 10)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(inv.expiresAt).toISOString().slice(0, 10)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={() => onRevoke(inv.operatorInvitationId)}
                    >
                      Revoke
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
