import js from "@eslint/js";
import tseslint from "typescript-eslint";
import boundaries from "eslint-plugin-boundaries";
import prettier from "eslint-config-prettier";
import prettierPlugin from "eslint-plugin-prettier";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  // Base ESLint recommended rules
  js.configs.recommended,

  // TypeScript ESLint recommended rules
  ...tseslint.configs.recommended,

  // Global configuration
  {
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        NodeJS: "readonly",
        React: "readonly",
        JSX: "readonly",
      },
      ecmaVersion: 2024,
      sourceType: "module",
    },
  },

  // TypeScript-specific configuration
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
        project: "./tsconfig.json",
      },
    },
    rules: {
      // TypeScript specific rules
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/prefer-optional-chain": "error",
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-import-type-side-effects": "error",
    },
  },

  // React and Next.js specific rules
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    plugins: {
      prettier: prettierPlugin,
      react,
      "react-hooks": reactHooks,
    },
    rules: {
      // Prettier integration
      "prettier/prettier": "error",

      // React rules
      "react/prop-types": "off", // Using TypeScript for prop validation
      "react/react-in-jsx-scope": "off", // Next.js doesn't require React in scope
      "react/jsx-uses-react": "off", // Next.js 11+ doesn't need React imports
      "react/jsx-uses-vars": "error",

      // React Hooks rules
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // General code quality rules
      "prefer-const": "error",
      "no-var": "error",
      "object-shorthand": "error",
      "prefer-template": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-debugger": "error",
      eqeqeq: ["error", "always"],
      curly: ["error", "all"],
      "no-eval": "error",
      "no-implied-eval": "error",
    },
    settings: {
      react: {
        version: "detect", // Automatically detect React version
        runtime: "automatic", // React 17+ JSX Transform
      },
    },
  },

  // Core-Features Architecture boundaries
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    plugins: {
      boundaries,
    },
    settings: {
      "boundaries/elements": [
        {
          type: "core",
          pattern: "core/**/*",
          mode: "folder",
        },
        {
          type: "features",
          pattern: "features/**/*",
          mode: "folder",
          capture: ["featureName"],
        },
        {
          type: "app",
          pattern: "app/**/*",
          mode: "folder",
        },
        {
          type: "components",
          pattern: "components/**/*",
          mode: "folder",
        },
      ],
      "boundaries/ignore": [
        "**/*.test.{js,jsx,ts,tsx}",
        "**/*.spec.{js,jsx,ts,tsx}",
        "**/__tests__/**/*",
        "node_modules/**/*",
        ".next/**/*",
      ],
    },
    rules: {
      // Core-Features Architecture enforcement
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: [
            // Core can import from anywhere (shared utilities)
            {
              from: "core",
              allow: ["core"],
            },
            // Features can import from core and components, but not from other features
            {
              from: "features",
              allow: ["core", "components", ["features", { featureName: "${from.featureName}" }]],
            },
            // App can import from anywhere
            {
              from: "app",
              allow: ["core", "features", "components", "app"],
            },
            // Components can import from core
            {
              from: "components",
              allow: ["core", "components"],
            },
          ],
        },
      ],
    },
  },

  // Next.js App Router specific rules
  {
    files: ["app/**/*.{js,jsx,ts,tsx}"],
    rules: {
      // Server Components and Client Components
      "import/no-default-export": "off", // Next.js pages require default exports
    },
  },

  // Server Actions
  {
    files: ["app/**/actions.{js,ts}", "app/actions/**/*.{js,ts}"],
    rules: {
      // Server Actions must be async and use "use server"
      "require-await": "error",
    },
  },

  // Configuration files
  {
    files: [
      "*.config.{js,ts,mjs}",
      "tailwind.config.{js,ts}",
      "next.config.{js,mjs}",
      "postcss.config.{js,mjs}",
    ],
    languageOptions: {
      globals: {
        module: "readonly",
        require: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        process: "readonly",
        Buffer: "readonly",
        global: "readonly",
      },
    },
    rules: {
      "import/no-default-export": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  },

  // Test files
  {
    files: [
      "**/*.test.{js,jsx,ts,tsx}",
      "**/*.spec.{js,jsx,ts,tsx}",
      "**/__tests__/**/*.{js,jsx,ts,tsx}",
    ],
    languageOptions: {
      globals: {
        // Jest globals
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        jest: "readonly",
        // Node.js globals
        process: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        module: "readonly",
        require: "readonly",
        global: "readonly",
      },
    },
    rules: {
      // Allow console in tests
      "no-console": "off",
      // Allow any in test files for mocking
      "@typescript-eslint/no-explicit-any": "off",
      // Allow non-null assertions in tests
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },

  // Prettier configuration (must be last to override conflicting rules)
  prettier,

  // Ignore patterns
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "build/**",
      ".vercel/**",
      ".supabase/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "*.tsbuildinfo",
      ".env*",
      "supabase/migrations/**",
      "supabase/seed.sql",
      "uploads/**",
      "docs/**",
      ".github/**",
      ".windsurf/**",
      "strage/**",
      "scripts/**",
    ],
  }
);
