'use client';

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
import { updatePasswordSchema, PASSWORD_POLICY } from '@template/auth';
import { updatePasswordAction } from '@/lib/actions/auth';

// Same Zod schema validates client + Server Action via the updatePassword
// flow. On success the User stays signed in on this device — every other
// Session is revoked server-side — and we land them on the org router.

type Values = z.infer<typeof updatePasswordSchema>;

export function ResetPasswordForm() {
  const router = useRouter();
  const form = useZodForm(updatePasswordSchema);

  async function onSubmit(values: Values) {
    const result = await updatePasswordAction(values);
    if (result.ok) {
      toast.success(result.data.message);
      router.push('/orgs');
      return;
    }

    // No recovery Session — bounce to forgot-password so the User can
    // ask for a fresh link.
    if (result.code === 'invalid-credentials') {
      toast.error(result.error);
      router.push('/forgot-password');
      return;
    }

    toast.error(result.error);
  }

  return (
    <form method="post" onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="password">New password</FieldLabel>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_POLICY.minLength}
          {...form.register('password')}
        />
        <FieldError message={form.formState.errors.password?.message} />
        <p className="text-muted-foreground text-sm">
          At least {PASSWORD_POLICY.minLength} characters. We block passwords found in known
          breaches.
        </p>
      </Field>
      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? 'Updating…' : 'Update password'}
      </Button>
    </form>
  );
}
