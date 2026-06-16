import type { ZodSchema, ZodTypeAny } from 'zod';
import { ZodOptional, ZodDefault, ZodEnum, ZodNumber, ZodString, ZodBoolean, ZodUnion } from 'zod';

export type VarDescriptor = {
  name: string;
  required: boolean;
  example?: string;
  description?: string;
};

export type SurfaceSchema = {
  surface: 'web' | 'admin' | 'worker-node' | 'worker-py';
  server: Record<string, ZodTypeAny>;
  client?: Record<string, ZodTypeAny>;
  shared?: Record<string, ZodTypeAny>;
  examples?: Record<string, string>;
  descriptions?: Record<string, string>;
};

function isOptional(schema: ZodTypeAny): boolean {
  if (schema instanceof ZodOptional || schema instanceof ZodDefault) return true;
  if (schema instanceof ZodUnion) {
    return schema._def.options.some(
      (opt: ZodTypeAny) => opt instanceof ZodOptional || opt instanceof ZodDefault,
    );
  }
  return false;
}

function defaultExample(schema: ZodTypeAny): string {
  const inner =
    schema instanceof ZodOptional || schema instanceof ZodDefault
      ? schema._def.innerType
      : schema;
  if (inner instanceof ZodEnum) return inner._def.values[0] ?? '';
  if (inner instanceof ZodNumber) return '0';
  if (inner instanceof ZodBoolean) return 'false';
  if (inner instanceof ZodString) return '';
  return '';
}

export function describeSchema(surface: SurfaceSchema): VarDescriptor[] {
  const all: Array<[string, ZodTypeAny]> = [
    ...Object.entries(surface.shared ?? {}),
    ...Object.entries(surface.server),
    ...Object.entries(surface.client ?? {}),
  ];
  return all.map(([name, schema]) => ({
    name,
    required: !isOptional(schema),
    example: surface.examples?.[name] ?? defaultExample(schema),
    description: surface.descriptions?.[name],
  }));
}

export function renderEnvExample(surface: SurfaceSchema): string {
  const lines: string[] = [
    `# Generated from packages/env/src/${surface.surface}.schema.ts`,
    `# Do not edit by hand. Run \`pnpm env:example\` to regenerate.`,
    '',
  ];
  for (const v of describeSchema(surface)) {
    if (v.description) lines.push(`# ${v.description}`);
    const marker = v.required ? '' : '# (optional) ';
    lines.push(`${marker}${v.name}=${v.example ?? ''}`);
    lines.push('');
  }
  return lines.join('\n');
}

export type { ZodSchema };
