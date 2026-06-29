'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, toast } from '@template/ui';
import { logoutAction } from '@/lib/actions/auth';

export function SignOutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const result = await logoutAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.replace('/login');
      router.refresh();
    });
  }

  return (
    <Button type="button" variant="outline" onClick={onClick} disabled={pending}>
      {pending ? 'Signing out…' : 'Sign out'}
    </Button>
  );
}
