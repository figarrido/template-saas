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
import { requestPasswordResetSchema } from '@template/auth';
import { requestPasswordResetAction } from '@/lib/actions/auth';

// Same Zod schema validates client + Server Action. The Server Action's
// response is always the generic "if an account exists..." shape — the
// form never branches on whether the email was registered (ADR-0002).

type Values = z.infer<typeof requestPasswordResetSchema>;

export function ForgotPasswordForm() {
  const form = useZodForm(requestPasswordResetSchema);
  const [sentMessage, setSentMessage] = useState<string | null>(null);

  async function onSubmit(values: Values) {
    const result = await requestPasswordResetAction(values);
    if (result.ok) {
      setSentMessage(result.data.message);
      toast.success(result.data.message);
      form.reset({ email: '' });
    } else {
      toast.error(result.error);
    }
  }

  return (
    <form method="post" onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
        <FieldError message={form.formState.errors.email?.message} />
      </Field>
      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? 'Sending…' : 'Send reset link'}
      </Button>
      {sentMessage ? (
        <p role="status" className="text-muted-foreground text-sm">
          {sentMessage}
        </p>
      ) : null}
    </form>
  );
}
