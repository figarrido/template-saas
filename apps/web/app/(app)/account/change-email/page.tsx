import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@template/ui';
import { ChangeEmailForm } from './change-email-form.js';

// Account-settings: change email. The actual re-auth + email-change request
// is handled inside `changeEmailAction` over the `changeEmail` flow in
// `packages/auth`. ADR-0003: current password is verified by a silent
// `signInWithPassword` before `updateUser({ email })`. With
// `auth.email.double_confirm_changes = true` Supabase emails BOTH the old
// and the new address — the change is applied only after both links are
// clicked (issue #7 secure double-confirm).

export default function ChangeEmailPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Change email</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangeEmailForm />
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
