import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@template/ui';
import { AUTH_MESSAGES } from '@template/auth';
import { LoginForm } from './login-form.js';

type SearchParams = { confirm?: string | string[] };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const invalid = (await searchParams).confirm === 'invalid';

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Log in</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {invalid ? (
            <div
              role="alert"
              className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
            >
              {AUTH_MESSAGES.confirmLinkInvalid}{' '}
              <Link className="underline" href="/check-email">
                Resend
              </Link>
            </div>
          ) : null}
          <LoginForm />
          <p className="text-muted-foreground text-sm">
            <Link className="underline" href="/forgot-password">
              Forgot your password?
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
