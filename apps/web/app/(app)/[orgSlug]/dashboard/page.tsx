import { Card, CardContent, CardHeader, CardTitle } from '@template/ui';

export default async function Dashboard({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-6 text-3xl font-bold">{orgSlug}</h1>
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
