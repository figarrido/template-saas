import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@template/ui';
import { SignUpForm } from './signup-form.js';

export default function SignUpPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Create an account</CardTitle>
        </CardHeader>
        <CardContent>
          <SignUpForm />
        </CardContent>
      </Card>
      <p className="text-muted-foreground text-center text-sm">
        Already have an account?{' '}
        <Link className="underline" href="/login">
          Log in
        </Link>
      </p>
    </main>
  );
}
