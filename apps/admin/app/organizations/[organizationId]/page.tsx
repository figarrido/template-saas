import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  PageHeader,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  Button,
} from '@template/ui';
import { requireOperator } from '@/lib/auth/gate';
import { getOrganizationDetail, listActivePlans } from '@/lib/data/organizations';
import { getAdminDb } from '@/lib/data/db';
import { listActiveComps } from '@template/billing/entitlements';
import { CompsPanel } from './comps-panel';

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  await requireOperator();

  const { organizationId } = await params;
  const detail = await getOrganizationDetail(getAdminDb(), organizationId);
  if (!detail) notFound();

  const [plans, comps] = await Promise.all([
    listActivePlans(getAdminDb()),
    listActiveComps(getAdminDb(), organizationId),
  ]);

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/organizations">← Organizations</Link>
        </Button>
      </div>

      <PageHeader title={detail.name} description={detail.slug} />

      <div className="mt-6 grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Display Name</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                </tr>
              </thead>
              <tbody>
                {detail.members.map((member) => (
                  <tr key={member.userId} className="border-b last:border-0">
                    <td className="px-4 py-3">{member.displayName ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary">{member.role}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Active Entitlements</CardTitle>
          </CardHeader>
          <CardContent>
            {detail.entitlements.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active entitlements.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Key</th>
                    <th className="px-4 py-3 font-medium">Source</th>
                    <th className="px-4 py-3 font-medium">Starts</th>
                    <th className="px-4 py-3 font-medium">Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.entitlements.map((e, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-4 py-3 font-mono">{e.key}</td>
                      <td className="px-4 py-3">
                        <Badge variant={e.sourceLabel === 'Comp' ? 'default' : 'secondary'}>
                          {e.sourceLabel}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(e.startsAt).toISOString().slice(0, 10)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {e.expiresAt
                          ? new Date(e.expiresAt).toISOString().slice(0, 10)
                          : 'No expiry'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
        <CompsPanel organizationId={organizationId} plans={plans} comps={comps} />
      </div>
    </main>
  );
}
