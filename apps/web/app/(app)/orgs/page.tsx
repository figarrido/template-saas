import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@template/ui';
import { getMyOrgSummaries } from '@/lib/data/org';

// Organization picker — shown to Users who are members of 2+ Organizations.
// docs/architecture/03-auth.md § First-login routing.
export default async function OrgPickerPage() {
  const orgs = await getMyOrgSummaries();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <Card>
        <CardHeader>
          <CardTitle>Choose an organization</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {orgs.map((org) => (
            <Link
              key={org.slug}
              href={`/${org.slug}/dashboard`}
              className="rounded-md border p-3 hover:bg-accent"
            >
              {org.name}
            </Link>
          ))}
          <Link
            href="/orgs/new"
            className="rounded-md border border-dashed p-3 text-center hover:bg-accent"
          >
            New organization
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
