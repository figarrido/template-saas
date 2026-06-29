import { Card, CardContent, CardHeader, CardTitle } from '@template/ui';

// Thin stub. The real first-org creation UI is a separate org feature
// (parent PRD #2 § Out of Scope).
export default function FirstOrgOnboarding() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <Card>
        <CardHeader>
          <CardTitle>Create your first organization</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            You're signed in but don't belong to any organization yet. The first-org
            creation flow ships with the org-management slice.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
