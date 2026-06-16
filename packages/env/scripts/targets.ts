import type { SurfaceSchema } from '../src/describe.js';
import { webSchema } from '../src/web.schema.js';
import { adminSchema } from '../src/admin.schema.js';
import { workerNodeSchema } from '../src/worker-node.schema.js';
import { workerPySchema } from '../src/worker-py.schema.js';

export type Target = {
  schema: SurfaceSchema;
  outputPath: string;
};

// Output paths relative to the repo root.
export const targets: Target[] = [
  { schema: webSchema, outputPath: 'apps/web/.env.example' },
  { schema: adminSchema, outputPath: 'apps/admin/.env.example' },
  { schema: workerNodeSchema, outputPath: 'services/worker-node/.env.example' },
  { schema: workerPySchema, outputPath: 'services/worker-py/.env.example' },
];
