import base from './base.js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';

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
    // Register Next's plugin so `@next/next/*` rules (and inline disable
    // directives referencing them) resolve. Only the plugin is composed here —
    // not the full `eslint-config-next`, which would re-register the react /
    // typescript-eslint plugins already set up in `base.js`.
    plugins: { react, 'react-hooks': reactHooks, '@next/next': nextPlugin },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, ...globals.es2022 },
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      // Classic React hooks rules. The full react-hooks v7 `recommended` set
      // also ships the React Compiler rules (purity, memoization, …) — opt into
      // those per-project if adopting the compiler.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react/jsx-key': 'error',
    },
  },
];
