import { Card, CardContent, CardHeader, CardTitle } from '@template/ui';
import { FirstOrgForm } from './first-org-form.js';

export default function FirstOrgOnboarding() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <Card>
        <CardHeader>
          <CardTitle>Create your first organization</CardTitle>
        </CardHeader>
        <CardContent>
          <FirstOrgForm />
        </CardContent>
      </Card>
    </main>
  );
}
