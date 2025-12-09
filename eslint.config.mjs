import { FlatCompat } from '@eslint/eslintrc';
import tanstackQuery from '@tanstack/eslint-plugin-query';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'build/**',
      'next-env.d.ts',
    ],
  },
  {
    plugins: {
      '@tanstack/query': tanstackQuery,
    },
    rules: {
      '@tanstack/query/exhaustive-deps': 'error',
      '@tanstack/query/no-rest-destructuring': 'warn',
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@supabase/supabase-js',
              importNames: ['createClient'],
              message:
                'Use Supabase accessors (e.g., getCatalogReadClient) instead of direct createClient imports.',
            },
          ],
        },
      ],
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'warn',
    },
  },
  {
    files: ['app/lib/supabaseServiceRoleClient.ts'],
    rules: {
      // Service role client is the intentional single point that wraps createClient.
      'no-restricted-imports': 'off',
    },
  },
  {
    files: ['app/lib/supabaseServerClient.ts'],
    rules: {
      // Server anon client wrapper is an approved createClient usage.
      'no-restricted-imports': 'off',
    },
  },
  {
    files: ['lib/metrics.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['**/*.test.*', '**/*.spec.*'],
    rules: {
      'no-console': 'off',
    },
  },
];

export default eslintConfig;
