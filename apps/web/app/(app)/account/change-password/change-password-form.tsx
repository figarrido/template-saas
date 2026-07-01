'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { z } from 'zod';
import {
  Button,
  Field,
  FieldError,
  FieldLabel,
  Input,
  useZodForm,
  toast,
} from '@template/ui';
import { changePasswordSchema, PASSWORD_POLICY } from '@template/auth';
import { changePasswordAction } from '@/lib/actions/auth';

// Same Zod schema validates client + Server Action (over the flow in
// `packages/auth`). The form surfaces the no-password-identity branch as
// an inline guidance message linking to the recovery flow — story 41 +
// issue #6 AC: "A User with no password Identity is guided to set one via
// recovery instead of being blocked."

type Values = z.infer<typeof changePasswordSchema>;

export function ChangePasswordForm() {
  const router = useRouter();
  const form = useZodForm(changePasswordSchema);
  const [needsRecovery, setNeedsRecovery] = useState(false);

  async function onSubmit(values: Values) {
    const result = await changePasswordAction(values);

    if (!result.ok) {
      if (result.code === 'no-password-identity') {
        setNeedsRecovery(true);
      }
      toast.error(result.error);
      return;
    }

    form.reset();
    toast.success(result.data.message);
    router.refresh();
  }

  if (needsRecovery) {
    return (
      <div className="flex flex-col gap-4">
        <p>
          Your account doesn&apos;t have a password yet. To set one, use the password-reset flow
          — we&apos;ll email you a link to choose a password.
        </p>
        <Button asChild>
          <Link href="/forgot-password">Set a password via recovery</Link>
        </Button>
      </div>
    );
  }

  return (
    <form method="post" onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="currentPassword">Current password</FieldLabel>
        <Input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          {...form.register('currentPassword')}
        />
        <FieldError message={form.formState.errors.currentPassword?.message} />
      </Field>
      <Field>
        <FieldLabel htmlFor="newPassword">New password</FieldLabel>
        <Input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_POLICY.minLength}
          {...form.register('newPassword')}
        />
        <FieldError message={form.formState.errors.newPassword?.message} />
        <p className="text-muted-foreground text-sm">
          At least {PASSWORD_POLICY.minLength} characters. We block passwords found in known breaches.
        </p>
      </Field>
      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? 'Updating…' : 'Change password'}
      </Button>
    </form>
  );
}
