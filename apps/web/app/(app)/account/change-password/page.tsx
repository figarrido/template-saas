import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@template/ui';
import { ChangePasswordForm } from './change-password-form.js';

// Account-settings: change password. The actual re-auth + update is handled
// inside `changePasswordAction` over the `changePassword` flow in
// `packages/auth`. ADR-0003: current password is verified by a silent
// `signInWithPassword` before `updateUser`.

export default function ChangePasswordPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
      <p className="text-muted-foreground text-center text-sm">
        Don&apos;t have a password yet?{' '}
        <Link className="underline" href="/forgot-password">
          Set one via password reset
        </Link>
      </p>
    </main>
  );
}
