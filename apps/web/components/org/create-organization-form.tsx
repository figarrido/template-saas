'use client';

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
import { createOrganizationSchema } from '@template/auth';
import { createOrganizationAction } from '@/lib/actions/org';

type Values = z.infer<typeof createOrganizationSchema>;

export function CreateOrganizationForm() {
  const form = useZodForm(createOrganizationSchema);
  const submitting = form.formState.isSubmitting;

  async function onSubmit(values: Values) {
    // Success redirects server-side; only a failure returns a result.
    const result = await createOrganizationAction(values);
    if (result && !result.ok) toast.error(result.error);
  }

  return (
    <form method="post" onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="name">Organization name</FieldLabel>
        <Input id="name" autoComplete="organization" {...form.register('name')} />
        <FieldError message={form.formState.errors.name?.message} />
      </Field>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'Creating…' : 'Create organization'}
      </Button>
    </form>
  );
}
