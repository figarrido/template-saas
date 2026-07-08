import { Card, CardContent, CardHeader, CardTitle } from '@template/ui';
import { OrgSwitcher } from '@/components/org/org-switcher';
import { SignOutButton } from './sign-out-button.js';

export default async function Dashboard({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  return (
    <main className="mx-auto max-w-4xl p-6">
      <OrgSwitcher currentSlug={orgSlug} />
      <div className="mb-6 mt-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">{orgSlug}</h1>
        <SignOutButton />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Dashboard</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Reference dashboard surface.</p>
        </CardContent>
      </Card>
    </main>
  );
}
