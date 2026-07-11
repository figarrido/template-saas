import { redirect } from 'next/navigation';
import { resolveAdminGate } from '@/lib/auth/gate';
import { LoginForm } from './login-form';

export default async function LoginPage() {
  const gate = await resolveAdminGate();

  if (gate.ok) redirect('/');
  if (!gate.ok && gate.reason === 'enroll') redirect('/enroll');
  if (!gate.ok && gate.reason === 'challenge') redirect('/challenge');

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <LoginForm />
      </div>
    </main>
  );
}
