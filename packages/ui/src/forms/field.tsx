'use client';

import * as React from 'react';
import { useForm, type FieldValues, type UseFormProps, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ZodSchema, z } from 'zod';
import { cn } from '../utils/cn.js';
import { Label } from '../components/label.js';

export function useZodForm<TSchema extends ZodSchema>(
  schema: TSchema,
  options?: Omit<UseFormProps<z.infer<TSchema>>, 'resolver'>,
): UseFormReturn<z.infer<TSchema>> {
  return useForm<z.infer<TSchema>>({
    ...options,
    // zodResolver v5 ships distinct Zod 3 / Zod 4 overloads that require the
    // concrete schema type (with `_def.typeName`); the generic `TSchema` erases
    // it. Field types still come from `useForm<z.infer<TSchema>>`, so cast the
    // schema at the resolver boundary only.
    resolver: zodResolver(schema as never),
  });
}

export type UseZodFormReturn<TSchema extends ZodSchema> = UseFormReturn<z.infer<TSchema>>;

export function Field({
  children,
  className,
}: React.PropsWithChildren<{ className?: string }>) {
  return <div className={cn('flex flex-col gap-2', className)}>{children}</div>;
}

export function FieldLabel({
  htmlFor,
  children,
  className,
}: React.PropsWithChildren<{ htmlFor?: string; className?: string }>) {
  return <Label htmlFor={htmlFor} className={className}>{children}</Label>;
}

export function FieldError({
  message,
  className,
}: {
  message?: string | null;
  className?: string;
}) {
  if (!message) return null;
  return (
    <p role="alert" className={cn('text-sm text-destructive', className)}>
      {message}
    </p>
  );
}

// Re-export the FieldValues type for consumer type-narrowing convenience.
export type { FieldValues };
