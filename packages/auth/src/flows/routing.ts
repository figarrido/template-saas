// First-login routing — issue #3 acceptance criterion: "After sign-in the
// User is routed by Organization count (0 → onboarding stub, 1 → dashboard,
// 2+ → picker)." Pure function so it can be unit-tested without touching the
// Next.js router; the Server Action calls it and returns the path.

export type OrgRef = { slug: string };

export type Destination =
  | { kind: 'onboarding'; path: '/onboarding/first-org' }
  | { kind: 'dashboard'; path: string; orgSlug: string }
  | { kind: 'picker'; path: '/orgs' };

export function destinationForOrganizations(orgs: ReadonlyArray<OrgRef>): Destination {
  if (orgs.length === 0) return { kind: 'onboarding', path: '/onboarding/first-org' };
  if (orgs.length === 1) {
    const [only] = orgs;
    if (!only) return { kind: 'onboarding', path: '/onboarding/first-org' };
    return { kind: 'dashboard', path: `/${only.slug}/dashboard`, orgSlug: only.slug };
  }
  return { kind: 'picker', path: '/orgs' };
}
