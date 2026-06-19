import base from './base.js';
import globals from 'globals';
import react from 'eslint-plugin-react';

// `getServiceClient` import ban for client-app surfaces.
// Consumers (e.g. `apps/web/eslint.config.js`) compose this rule into their
// flat config — `apps/admin` and `services/*` legitimately use service-role and
// must NOT apply this rule. See docs/architecture/02-data.md § Query layer.
export const banServiceClient = {
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: '@template/db',
            importNames: ['getServiceClient'],
            message:
              '`getServiceClient` bypasses RLS and must not be imported from apps/web. Push cross-tenant operations into an RPC or worker job. See docs/architecture/02-data.md.',
          },
        ],
      },
    ],
  },
};

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...base,
  {
    plugins: { react },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, ...globals.es2022 },
    },
    rules: {
      'react/jsx-key': 'error',
    },
  },
];
