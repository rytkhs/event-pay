import { readdirSync } from 'node:fs'
import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
})

const sourceFiles = ['**/*.{ts,tsx}']
const featureImportRestrictionPatterns = [
  {
    group: ['@/features/**'],
    message: '@features/* を使用してください（@/features は禁止）',
  },
  {
    group: ['@features/*/*', '!@features/*/server'],
    message: 'features の deep import は禁止です。@features/<name> か @features/<name>/server を使用してください',
  },
]
const featureDatabaseImportRestrictionPattern = {
  group: ['@/types/database'],
  message: 'features層では@/types/databaseを直接importせず、@core/types/* を使用してください',
}
const featureSelfReferenceOverrides = readdirSync(new URL('./features', import.meta.url), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()
  .map((featureName) => ({
    files: [`features/${featureName}/**/*`],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...featureImportRestrictionPatterns,
            featureDatabaseImportRestrictionPattern,
            {
              group: [`@features/${featureName}`, `@features/${featureName}/**`],
              message: `同一feature内では相対パスを使用してください（@features/${featureName} → ../...）`,
            },
          ],
        },
      ],
    },
  }))

const eslintConfig = [
  ...compat
    .config({
      root: true,
      extends: [
        'plugin:@next/next/core-web-vitals',
        'plugin:react/recommended',
        'plugin:react-hooks/recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:jsx-a11y/recommended',
        'plugin:import/recommended',
        'plugin:import/typescript',
        'plugin:boundaries/recommended',
        'prettier',
      ],
      plugins: ['@typescript-eslint', 'jsx-a11y', 'import', 'boundaries', 'react', 'react-hooks'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
        project: ['./tsconfig.json', './tsconfig.test.json'],
      },
      settings: {
        react: {
          version: 'detect',
        },
        'import/resolver': {
          typescript: {
            alwaysTryTypes: true,
            project: ['./tsconfig.json', './tsconfig.test.json'],
          },
          node: {
            extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
          },
        },
        'boundaries/elements': [
          {
            type: 'app',
            pattern: 'app/**/*',
          },
          {
            type: 'features',
            pattern: 'features/*',
            capture: ['featureName'],
          },
          {
            type: 'core',
            pattern: 'core/**/*',
          },
          {
            type: 'components-ui',
            pattern: 'components/ui/**/*',
          },
          {
            type: 'components-errors',
            pattern: 'components/errors/**/*',
          },
          {
            type: 'types',
            pattern: 'types/**/*',
          },
        ],
      },
      rules: {
      // ===== アーキテクチャ境界ルール =====
      // 依存方向（レイヤ境界）は boundaries/element-types で一元管理
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            // app層は全てにアクセス可能（自分自身も含む）
            {
              from: 'app',
              allow: ['app', 'features', 'core', 'components-ui', 'components-errors', 'types'],
            },
            // features層はcoreとcomponents/uiのみアクセス可能
            {
              from: 'features',
              allow: ['core', 'components-ui', 'types'],
            },
            // core層は自身とtypesのみ
            {
              from: 'core',
              allow: ['core', 'types'],
            },
            // components/ui層は外部ライブラリとtypesのみ
            {
              from: 'components-ui',
              allow: ['types'],
            },
            // components/errors層はtypesとcoreのみ
            {
              from: 'components-errors',
              allow: ['types', 'core'],
            },
          ],
        },
      ],
      // 公開入口（features配下のimport可能ファイル）は boundaries/entry-point で一元管理
      'boundaries/entry-point': [
        'error',
        {
          default: 'allow',
          rules: [
            {
              target: 'features',
              disallow: ['**/*'],
            },
            {
              target: 'features',
              allow: ['index.{js,ts,tsx}', 'server.{js,ts,tsx}'],
            },
          ],
        },
      ],

      // ===== TypeScript厳格化ルール =====
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/explicit-function-return-type': [
        'off',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',

      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/prefer-optional-chain': 'warn',

      // ===== セキュリティ関連ルール =====
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      'no-restricted-syntax': 'off',
      // import記法制約（features deep import禁止・alias統一）は no-restricted-imports で管理
      'no-restricted-imports': [
        'error',
        {
          patterns: featureImportRestrictionPatterns,
        },
      ],

      // ===== Next.js & React ベストプラクティス =====
      'react/react-in-jsx-scope': 'off', // Next.js 13+では不要
      'react/prop-types': 'off', // TypeScriptを使用

      // Next.js専用ルール
      '@next/next/no-img-element': 'error',

      // ===== インポート管理ルール =====
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          pathGroups: [
            {
              pattern: 'react',
              group: 'external',
              position: 'before',
            },
            {
              pattern: 'next/**',
              group: 'external',
              position: 'before',
            },
            {
              pattern: '@core/**',
              group: 'internal',
              position: 'before',
            },
            {
              pattern: '@features/**',
              group: 'internal',
              position: 'before',
            },
            {
              pattern: '@components/**',
              group: 'internal',
              position: 'before',
            },
            {
              pattern: '@/**',
              group: 'internal',
              position: 'after',
            },
          ],
          pathGroupsExcludedImportTypes: ['react'],
          'newlines-between': 'always',
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
        },
      ],
      'import/no-cycle': 'error',
      'import/no-self-import': 'error',

      // ===== アクセシビリティルール（recommendedとの差分・追加のみ） =====
      'jsx-a11y/lang': 'error',
      'jsx-a11y/no-autofocus': 'warn',

      // ===== パフォーマンス関連ルール =====
      'react/jsx-no-bind': 'off',
      },
      overrides: [
      // テストファイル用の緩和設定
      {
        files: ['**/__tests__/**/*', '**/*.test.*', '**/*.spec.*'],
        env: {
          jest: true,
        },
        rules: {
          '@typescript-eslint/no-explicit-any': 'off',
          '@typescript-eslint/no-unsafe-assignment': 'off',
          '@typescript-eslint/no-unsafe-call': 'off',
          '@typescript-eslint/no-unsafe-member-access': 'off',
          'no-console': 'off',
        },
      },
      // Next.js設定ファイル用
      {
        files: ['next.config.*', 'tailwind.config.*', 'postcss.config.*'],
        rules: {
          '@typescript-eslint/no-var-requires': 'off',
          'import/no-anonymous-default-export': 'off',
        },
      },
      // Supabase関連ファイル用
      {
        files: ['supabase/**/*'],
        rules: {
          '@typescript-eslint/explicit-function-return-type': 'off',
          'boundaries/element-types': 'off',
        },
      },
      // API routes用
      {
        files: ['app/api/**/*'],
        rules: {
          '@typescript-eslint/explicit-function-return-type': 'off',
          // API Route は server-only 入口のみ許可する
          'no-restricted-imports': [
            'error',
            {
              patterns: [
                {
                  group: ['@/features/**'],
                  message: '@features/* を使用してください（@/features は禁止）',
                },
                {
                  group: [
                    '@features/*',
                    '!@features/*/',
                    '@features/*/*',
                    '!@features/*/server',
                  ],
                  message: 'app/api では @features/*/server を使用してください（@features/* は禁止）',
                },
              ],
            },
          ],
        },
      },
      {
        files: ['features/**/*', 'core/**/*'],
        rules: {
          'no-restricted-syntax': [
            'warn',
            {
              selector: "ExpressionStatement[expression.value='use server']",
              message: '"use server" は app/** に移動してください',
            },
          ],
        },
      },
      {
        files: ['features/**/*'],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              patterns: [
                featureDatabaseImportRestrictionPattern,
              ],
            },
          ],
        },
      },
      ...featureSelfReferenceOverrides,
      ],
    })
    .map((config) => {
      if ('files' in config) {
        return config
      }

      if ('ignores' in config && Object.keys(config).length === 1) {
        return config
      }

      return {
        ...config,
        files: sourceFiles,
      }
    }),
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'dist/**',
      'build/**',
      'coverage/**',
      '**/*.md',
      '.eslintrc.js',
    ],
  },
]

export default eslintConfig
