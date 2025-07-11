import nextJest from "next/jest.js";

const createJestConfig = nextJest({
  dir: "./",
});

const config = {
  coverageProvider: "v8",
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/__tests__/config/jest-profiles/unit.setup.mjs"],
  testMatch: [
    "<rootDir>/__tests__/lib/**/*.test.{js,ts}",
    "<rootDir>/__tests__/components/**/*.test.{js,ts,tsx}",
    "<rootDir>/__tests__/utils/**/*.test.{js,ts}",
    "<rootDir>/__tests__/examples/simple-*.test.{js,ts}",
    "<rootDir>/__tests__/accessibility/**/*.test.{js,ts,tsx}",
    "<rootDir>/__tests__/mobile/**/*.test.{js,ts,tsx}",
    "<rootDir>/__tests__/events/**/*.test.{js,ts,tsx}",
    "<rootDir>/__tests__/calculations/**/*.test.{js,ts}",
  ],
  collectCoverageFrom: [
    "lib/**/*.{js,ts}",
    "components/**/*.{js,ts,tsx}",
    "!**/*.d.ts",
    "!**/node_modules/**",
  ],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  transformIgnorePatterns: [
    "node_modules/(?!(@supabase|@babel|babel))",
  ],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^@supabase/(.*)$": "<rootDir>/__tests__/mocks/supabase/$1.js",
  },
};

export default createJestConfig(config);
