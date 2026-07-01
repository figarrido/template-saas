'use client';

import { useState } from 'react';
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
import { signInSchema } from '@template/auth';
import {
  loginAction,
  resendVerificationAction,
  routeAfterLoginAction,
} from '@/lib/actions/auth';

// docs/architecture/07-frontend.md § Forms: same Zod schema validates
// client and Server Action. Shared in `packages/auth` so other surfaces
// (sign-up, change-email) can reuse it without copy-paste.

type Values = z.infer<typeof signInSchema>;

export function LoginForm() {
  const form = useZodForm(signInSchema);
  const [needsConfirm, setNeedsConfirm] = useState<string | null>(null);

  async function onSubmit(values: Values) {
    const result = await loginAction(values);

    if (!result.ok) {
      if (result.code === 'not-confirmed') {
        setNeedsConfirm(values.email);
        toast.error(result.error);
        return;
      }
      setNeedsConfirm(null);
      toast.error(result.error);
      return;
    }

    setNeedsConfirm(null);
    await routeAfterLoginAction();
  }

  async function onResend() {
    if (!needsConfirm) return;
    const result = await resendVerificationAction({ email: needsConfirm });
    if (result.ok) toast.success(result.data.message);
    else toast.error(result.error);
  }

  return (
    <form method="post" onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
        <FieldError message={form.formState.errors.email?.message} />
      </Field>
      <Field>
        <FieldLabel htmlFor="password">Password</FieldLabel>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          {...form.register('password')}
        />
        <FieldError message={form.formState.errors.password?.message} />
      </Field>
      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? 'Signing in…' : 'Sign in'}
      </Button>
      {needsConfirm ? (
        <Button type="button" variant="outline" onClick={onResend}>
          Resend confirmation email
        </Button>
      ) : null}
    </form>
  );
}
