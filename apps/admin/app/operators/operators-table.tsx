'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, Badge, Button, EmptyState, toast } from '@template/ui';
import { revokeOperatorAction, resetOperatorMfaAction } from '@/lib/actions/operators';
import type { OperatorRow } from '@/lib/data/operators';

export function OperatorsTable({
  operators,
  currentUserId,
}: {
  operators: OperatorRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onRevoke(userId: string) {
    startTransition(async () => {
      const result = await revokeOperatorAction(userId);
      if (!result.ok) return void toast.error(result.error);
      toast.success('Operator access revoked.');
      router.refresh();
    });
  }

  function onResetMfa(userId: string) {
    startTransition(async () => {
      const result = await resetOperatorMfaAction(userId);
      if (!result.ok) return void toast.error(result.error);
      toast.success('MFA reset. The operator must re-enroll on next sign-in.');
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="p-0">
        {operators.length === 0 ? (
          <EmptyState title="No operators" description="Operators will appear here." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Granted</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {operators.map((op) => (
                <tr key={op.userId} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-3">{op.email}</td>
                  <td className="px-4 py-3">
                    <Badge variant={op.status === 'active' ? 'secondary' : 'outline'}>
                      {op.status === 'active' ? 'Active' : 'Revoked'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(op.grantedAt).toISOString().slice(0, 10)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {op.status === 'active' && op.userId !== currentUserId ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isPending}
                          onClick={() => onResetMfa(op.userId)}
                        >
                          Reset MFA
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isPending}
                          onClick={() => onRevoke(op.userId)}
                        >
                          Revoke
                        </Button>
                      </div>
                    ) : op.userId === currentUserId ? (
                      <span className="text-xs text-muted-foreground">You</span>
                    ) : null}
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
