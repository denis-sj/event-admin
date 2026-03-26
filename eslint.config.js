import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['**/dist/', '**/node_modules/', '**/.astro/', '**/build/', '**/.cache/'],
  },
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    files: ['packages/**/*.ts', 'packages/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
);
