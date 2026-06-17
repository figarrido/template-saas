import next from '@template/config/eslint/next';
import { banServiceClient } from '@template/config/eslint/next';

// apps/web is the surface where the `getServiceClient` import ban applies.
// docs/architecture/02-data.md: cross-tenant access happens via RPCs or
// worker jobs, never inline in the client app.
export default [
  ...next,
  {
    files: ['**/*.{ts,tsx}'],
    ignores: ['.next/**'],
    rules: banServiceClient.rules,
  },
];
