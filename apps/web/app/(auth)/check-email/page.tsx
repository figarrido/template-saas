import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@template/ui';
import { ResendVerificationButton } from './resend-button.js';

// Generic "check your email" interstitial. The copy is identical whether
// the User just signed up with a new address or hit the deliberately-
// indistinguishable already-registered branch (ADR-0002 — no account-
// existence leak). The resend affordance solves the lost-email problem
// without telling the User whether their account actually exists.

type SearchParams = { email?: string | string[] };

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = (await searchParams).email;
  const email = typeof raw === 'string' && raw.includes('@') ? raw : undefined;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p>
            If you can sign up with that address, we&apos;ve sent a confirmation link. Open the email
            and click the link to finish creating your account.
          </p>
          <p className="text-muted-foreground text-sm">
            Didn&apos;t get an email? Check your spam folder, then resend.
          </p>
          <ResendVerificationButton email={email} />
        </CardContent>
      </Card>
      <p className="text-muted-foreground text-center text-sm">
        Wrong account?{' '}
        <Link className="underline" href="/signup">
          Try again
        </Link>{' '}
        ·{' '}
        <Link className="underline" href="/login">
          Log in
        </Link>
      </p>
    </main>
  );
}
