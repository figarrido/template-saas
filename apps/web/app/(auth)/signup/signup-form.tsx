'use client';

import { useState } from 'react';
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
import { signUpSchema, PASSWORD_POLICY } from '@template/auth';
import { signUpAction } from '@/lib/actions/auth';

// The same Zod schema validates client-side (this form) and server-side
// (the Server Action via the flow function in `packages/auth`).
// docs/architecture/07-frontend.md § Forms.

type Values = z.infer<typeof signUpSchema>;

export function SignUpForm() {
  const router = useRouter();
  const form = useZodForm(signUpSchema);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(values: Values) {
    setSubmitting(true);
    const result = await signUpAction(values);
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    // Generic interstitial — same destination whether the email was new
    // or already registered (ADR-0002). The email param lets the
    // interstitial offer a one-tap resend without re-asking.
    const params = new URLSearchParams({ email: values.email });
    router.push(`/check-email?${params.toString()}`);
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
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
          autoComplete="new-password"
          minLength={PASSWORD_POLICY.minLength}
          {...form.register('password')}
        />
        <FieldError message={form.formState.errors.password?.message} />
        <p className="text-muted-foreground text-sm">
          At least {PASSWORD_POLICY.minLength} characters. We block passwords found in known breaches.
        </p>
      </Field>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Creating account…' : 'Sign up'}
      </Button>
    </form>
  );
}
