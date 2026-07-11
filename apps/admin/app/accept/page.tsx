import { Card, CardContent, CardHeader, CardTitle } from '@template/ui';
import { previewOperatorInvitation } from '@template/auth';
import { getOperatorInvitationPorts } from '@/lib/data/operator-invitations';
import { AcceptForm } from './accept-form';

export default async function AcceptPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const sp = await searchParams;
  const token = typeof sp.token === 'string' ? sp.token : '';

  const preview = await previewOperatorInvitation(getOperatorInvitationPorts(), token);

  if (!preview.ok) {
    return (
      <main className="mx-auto max-w-md p-6">
        <Card>
          <CardHeader>
            <CardTitle>Invitation not valid</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              This invitation link is no longer valid.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <AcceptForm
        token={token}
        requiresPassword={preview.requiresPassword}
        email={preview.email}
      />
    </main>
  );
}
