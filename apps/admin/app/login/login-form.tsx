'use client';

import { useRouter } from 'next/navigation';
import type { z } from 'zod';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  FieldError,
  FieldLabel,
  Input,
  useZodForm,
  toast,
} from '@template/ui';
import { signInSchema } from '@template/auth';
import { signInAction } from '@/lib/actions/auth';

type Values = z.infer<typeof signInSchema>;

export function LoginForm() {
  const router = useRouter();
  const form = useZodForm(signInSchema);

  async function onSubmit(values: Values) {
    const result = await signInAction(values);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    router.push('/');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Operator sign-in</CardTitle>
      </CardHeader>
      <CardContent>
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
        </form>
      </CardContent>
    </Card>
  );
}
