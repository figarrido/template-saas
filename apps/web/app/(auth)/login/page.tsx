import { Card, CardContent, CardHeader, CardTitle } from '@template/ui';
import { LoginForm } from './login-form.js';
import { OAuthButtons } from '../oauth-buttons.js';

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <Card>
        <CardHeader>
          <CardTitle>Log in</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <LoginForm />
          <OAuthButtons />
        </CardContent>
      </Card>
    </main>
  );
}
