import { cache } from 'react';
import { getRequestClient } from '@/lib/supabase/server';

export type OrgMembership = {
  organization_id: string;
  role: string;
  organizations: { name: string; slug: string } | null;
};

// Read-side helper for RSC. cache() memoizes per-request so multiple
// components asking for the active org share one round-trip.
export const getMyOrganizations = cache(async (): Promise<OrgMembership[]> => {
  const supabase = await getRequestClient();
  const { data, error } = await supabase
    .from('memberships')
    .select('organization_id, role, organizations(name, slug)');
  if (error) throw error;
  return (data ?? []) as unknown as OrgMembership[];
});
