// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '\\.\\./',
              message:
                'Импорт наружу текущей папки — только через @src/*. Относительный путь допустим лишь до соседа по той же папке.',
            },
          ],
        },
      ],
      "prettier/prettier": ["error", { endOfLine: "auto" }],
    },
  },
);
