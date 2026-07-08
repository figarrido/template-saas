import { Card, CardContent, CardHeader, CardTitle } from '@template/ui';
import { CreateOrganizationForm } from '@/components/org/create-organization-form';

// "New organization" destination for existing Members, reached from the org
// picker and the dashboard org switcher. Same form + Server Action + RPC as
// the first-org onboarding flow (#18). The `orgs` and `new` path segments are
// both reserved in create_organization, so no org slug can shadow this route.
export default function NewOrgPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <Card>
        <CardHeader>
          <CardTitle>Create a new organization</CardTitle>
        </CardHeader>
        <CardContent>
          <CreateOrganizationForm />
        </CardContent>
      </Card>
    </main>
  );
}
