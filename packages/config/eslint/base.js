import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

// Cross-package import bans:
//   - `packages/flags` MUST NOT import `packages/billing` — entitlements API is
//     injected, never imported. See docs/architecture/10-feature-flags.md.
// Surface-specific bans (e.g. `getServiceClient` in apps/web/**) live in the
// `eslint/next.js` preset and are applied by the consuming app's config.
export const restrictedCrossPackageImports = {
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: '@template/billing',
            message:
              '`packages/flags` must not import `packages/billing`. Inject the entitlements API instead (see docs/architecture/10-feature-flags.md).',
          },
        ],
      },
    ],
  },
};

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**', '**/coverage/**', '**/.turbo/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.es2022 },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
];
