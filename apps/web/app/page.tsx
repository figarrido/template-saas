import Link from 'next/link';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@template/ui';

export default function Marketing() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-8 p-6">
      <h1 className="text-4xl font-bold">Template SaaS</h1>
      <p className="text-muted-foreground">
        Reference Next.js + Supabase application. See <code>docs/architecture/</code>.
      </p>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Get started</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button asChild>
            <Link href="/login">Log in</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/signup">Sign up</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
