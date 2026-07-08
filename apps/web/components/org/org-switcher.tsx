import Link from 'next/link';
import { getMyOrgSummaries } from '@/lib/data/org';

// Minimal server-rendered org switcher for the dashboard top nav. Lists the
// User's Organizations (the active one — matched by URL slug — is marked) and
// offers the same "New organization" action as the picker. Display + navigation
// only; per docs/architecture/03-auth.md the switcher will later update the
// active-org cookie + soft-reload on select — that mechanic is a separate slice.
export async function OrgSwitcher({ currentSlug }: { currentSlug: string }) {
  const orgs = await getMyOrgSummaries();

  return (
    <nav aria-label="Organizations" className="flex flex-wrap items-center gap-2">
      {orgs.map((org) => (
        <Link
          key={org.slug}
          href={`/${org.slug}/dashboard`}
          aria-current={org.slug === currentSlug ? 'page' : undefined}
          className={
            org.slug === currentSlug
              ? 'rounded-md border px-3 py-1 text-sm font-semibold'
              : 'rounded-md border px-3 py-1 text-sm text-muted-foreground hover:bg-accent'
          }
        >
          {org.name}
        </Link>
      ))}
      <Link
        href="/orgs/new"
        className="rounded-md border border-dashed px-3 py-1 text-sm hover:bg-accent"
      >
        New organization
      </Link>
    </nav>
  );
}
