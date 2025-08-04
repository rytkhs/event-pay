import nextJest from "next/jest.js";

const createJestConfig = nextJest({
  dir: "./",
});

// EventPay統合テスト用のシンプルなJest設定
const jestConfig = {
  // 基本設定
  testEnvironment: "jsdom",
  // 統合テストと単体テストで異なるセットアップファイルを使用
  setupFilesAfterEnv: [
    process.env.TEST_TYPE === "integration"
      ? "<rootDir>/__tests__/integration-setup.js"
      : "<rootDir>/__tests__/setup.js",
  ],

  // モジュール解決設定
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },

  // テストファイルのパターン
  testMatch: ["**/__tests__/**/*.test.{js,ts,tsx}", "**/__tests__/**/*.spec.{js,ts,tsx}"],

  // 除外するパターン
  testPathIgnorePatterns: [
    "<rootDir>/.next/",
    "<rootDir>/node_modules/",
    "<rootDir>/__tests__/config/",
    "<rootDir>/__tests__/helpers/",
    "<rootDir>/__tests__/mocks/",
  ],

  // 変換設定
  transform: {
    "^.+\\.(js|jsx|ts|tsx)$": [
      "@swc/jest",
      {
        jsc: {
          target: "es2020",
          parser: {
            syntax: "typescript",
            tsx: true,
            decorators: true,
          },
          transform: {
            react: {
              runtime: "automatic",
            },
          },
        },
        module: {
          type: "commonjs",
        },
      },
    ],
  },

  // 変換を無視するパターン
  transformIgnorePatterns: [
    "node_modules/(?!(@supabase|@types|@babel|@radix-ui|@hookform|@stripe|@upstash|@resend|uuid))",
  ],

  // カバレッジ設定（開発時は無効化でパフォーマンス向上）
  collectCoverage: process.env.NODE_ENV === "production" || process.env.CI === "true",
  collectCoverageFrom: [
    "app/**/*.{js,ts,tsx}",
    "components/**/*.{js,ts,tsx}",
    "lib/**/*.{js,ts}",
    "hooks/**/*.{js,ts,tsx}",
    "!**/*.d.ts",
    "!**/node_modules/**",
    "!**/__tests__/**",
    "!**/coverage/**",
    "!**/.next/**",
  ],

  // テストタイムアウト（統合テストは少し長めに）
  testTimeout: process.env.TEST_TYPE === "integration" ? 30000 : 5000,

  // 並列実行設定
  maxWorkers: "50%",

  // エラー処理
  errorOnDeprecated: true,

  // 環境変数
  testEnvironmentOptions: {
    customExportConditions: [""],
  },

  // グローバル設定
  globals: {
    "ts-jest": {
      useESM: true,
    },
  },

  // 詳細出力
  verbose: true,

  // テスト結果の出力形式
  reporters: ["default"],

  // セットアップ後の処理
  // setupFiles: ["<rootDir>/__tests__/setup.js"],
};

export default createJestConfig(jestConfig);
