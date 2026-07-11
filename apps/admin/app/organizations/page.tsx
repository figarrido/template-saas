import Link from 'next/link';
import { PageHeader, SearchInput, Card, CardContent, Badge, Button, EmptyState } from '@template/ui';
import { requireOperator } from '@/lib/auth/gate';
import { listOrganizations } from '@/lib/data/organizations';
import { getAdminDb } from '@/lib/data/db';

export default async function OrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireOperator();

  const { q, page } = await searchParams;
  const search = typeof q === 'string' ? q : undefined;
  const pageNum = Number(page) || 1;

  const { rows, total, page: current, pageSize } = await listOrganizations(getAdminDb(), {
    search,
    page: pageNum,
  });

  const hasNext = current * pageSize < total;

  return (
    <main className="mx-auto max-w-4xl p-6">
      <PageHeader title="Organizations" description={`${total} total`} />

      <form action="/organizations" method="get" className="mt-4">
        <SearchInput name="q" defaultValue={search ?? ''} placeholder="Search by name or slug" />
      </form>

      <Card className="mt-6">
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <EmptyState title="No organizations found" description="Try a different search term." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Slug</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">Members</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.organizationId} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/organizations/${row.organizationId}`}
                        className="font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        {row.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{row.slug}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(row.createdAt).toISOString().slice(0, 10)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{row.memberCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <span>Page {current}</span>
        <div className="flex gap-2">
          {current > 1 && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/organizations?${search ? `q=${encodeURIComponent(search)}&` : ''}page=${current - 1}`}>
                Previous
              </Link>
            </Button>
          )}
          {hasNext && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/organizations?${search ? `q=${encodeURIComponent(search)}&` : ''}page=${current + 1}`}>
                Next
              </Link>
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}
