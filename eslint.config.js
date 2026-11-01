import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'release/**',
      'test-results/**',
      'playwright-report/**',
      '.local/**',
      '.test-data/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/**/*.js', 'electron/preload.cjs', 'tests/e2e/**/*.js'],
    languageOptions: { globals: globals.browser },
  },
];
