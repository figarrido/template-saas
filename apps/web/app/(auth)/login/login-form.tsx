'use client';

import { z } from 'zod';
import { Button, Field, FieldError, FieldLabel, Input, useZodForm, toast } from '@template/ui';
import { loginAction } from '@/lib/actions/auth';

// Same Zod schema validates client and Server Action — docs/architecture/07-frontend.md.
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export function LoginForm() {
  const form = useZodForm(loginSchema);

  async function onSubmit(values: z.infer<typeof loginSchema>) {
    const result = await loginAction(values);
    if (!result.ok) toast.error(result.error);
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
        <Input id="password" type="password" autoComplete="current-password" {...form.register('password')} />
        <FieldError message={form.formState.errors.password?.message} />
      </Field>
      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
