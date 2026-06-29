import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@template/ui';
import { AUTH_MESSAGES } from '@template/auth';
import { ForgotPasswordForm } from './forgot-form.js';

// Forgot-password landing. The Server Action behind this form always
// returns the generic "if an account exists..." response regardless of
// whether the email is registered (ADR-0002 — no account-existence leak).
// The form swaps to a confirmation message rather than redirecting, so
// the User can request again without leaving the page.

type SearchParams = { reset?: string | string[] };

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const invalid = (await searchParams).reset === 'invalid';

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Reset your password</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {invalid ? (
            <div
              role="alert"
              className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
            >
              {AUTH_MESSAGES.recoverySessionMissing}
            </div>
          ) : null}
          <p className="text-muted-foreground text-sm">
            Enter the email for your account and we&apos;ll send you a link to set a new
            password.
          </p>
          <ForgotPasswordForm />
        </CardContent>
      </Card>
      <p className="text-muted-foreground text-center text-sm">
        Remembered it?{' '}
        <Link className="underline" href="/login">
          Log in
        </Link>
      </p>
    </main>
  );
}
