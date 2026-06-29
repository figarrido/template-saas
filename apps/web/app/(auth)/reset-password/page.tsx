import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@template/ui';
import { ResetPasswordForm } from './reset-form.js';

// Reset-password landing. /auth/confirm has already verified the recovery
// `token_hash` and written the Session cookies, so the form just collects
// a new password and posts it to the updatePassword Server Action. The
// flow function revokes every OTHER Session for the User on success
// (issue #5 acceptance criterion) while keeping this device signed in.

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Set a new password</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ResetPasswordForm />
        </CardContent>
      </Card>
      <p className="text-muted-foreground text-center text-sm">
        Need a fresh link?{' '}
        <Link className="underline" href="/forgot-password">
          Request again
        </Link>
      </p>
    </main>
  );
}
