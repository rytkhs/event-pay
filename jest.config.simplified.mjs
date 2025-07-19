import nextJest from "next/jest.js";

const createJestConfig = nextJest({
  dir: "./",
});

// 共通設定
const baseConfig = {
  coverageProvider: "v8",
  testEnvironment: "jsdom",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  transformIgnorePatterns: ["node_modules/(?!(@supabase|@types|@babel|@radix-ui|@hookform))"],
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
};

// テストタイプ別設定
const configs = {
  unit: {
    ...baseConfig,
    setupFilesAfterEnv: ["<rootDir>/__tests__/config/jest-profiles/simplified-unit.setup.mjs"],
    testMatch: [
      "<rootDir>/__tests__/lib/**/*.test.{js,ts}",
      "<rootDir>/__tests__/components/**/*.test.{js,ts,tsx}",
      "<rootDir>/__tests__/utils/**/*.test.{js,ts}",
      "<rootDir>/__tests__/examples/simple-*.test.{js,ts}",
      "<rootDir>/__tests__/accessibility/**/*.test.{js,ts,tsx}",
      "<rootDir>/__tests__/mobile/**/*.test.{js,ts,tsx}",
      "<rootDir>/__tests__/events/**/*.test.{js,ts,tsx}",
      "<rootDir>/__tests__/calculations/**/*.test.{js,ts}",
      "<rootDir>/__tests__/hooks/**/*.test.{js,ts,tsx}",
    ],
    collectCoverageFrom: [
      "lib/**/*.{js,ts}",
      "components/**/*.{js,ts,tsx}",
      "hooks/**/*.{js,ts,tsx}",
      "!**/*.d.ts",
      "!**/node_modules/**",
    ],
  },
  integration: {
    ...baseConfig,
    setupFilesAfterEnv: [
      "<rootDir>/__tests__/config/jest-profiles/simplified-integration.setup.mjs",
    ],
    setupFiles: ["<rootDir>/__tests__/config/jest-profiles/integration.env.mjs"],
    testMatch: [
      "<rootDir>/__tests__/pages/**/*.test.{js,ts,tsx}",
      "<rootDir>/__tests__/integration/**/*.test.{js,ts,tsx}",
      "<rootDir>/__tests__/security/**/*.test.{js,ts,tsx}",
    ],
    collectCoverageFrom: [
      "app/**/*.{js,ts,tsx}",
      "components/**/*.{js,ts,tsx}",
      "lib/**/*.{js,ts}",
      "!**/*.d.ts",
      "!**/node_modules/**",
    ],
  },
  e2e: {
    ...baseConfig,
    setupFilesAfterEnv: ["<rootDir>/__tests__/config/jest-profiles/simplified-e2e.setup.mjs"],
    testMatch: ["<rootDir>/__tests__/e2e/**/*.test.{js,ts}"],
    collectCoverageFrom: [
      "app/**/*.{js,ts,tsx}",
      "components/**/*.{js,ts,tsx}",
      "lib/**/*.{js,ts}",
      "!**/*.d.ts",
      "!**/node_modules/**",
    ],
  },
};

// 環境変数でテストタイプを選択
const testType = process.env.TEST_TYPE || "unit";
const config = configs[testType] || configs.unit;

export default createJestConfig(config);
