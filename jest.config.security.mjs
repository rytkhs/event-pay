import nextJest from "next/jest.js";

const createJestConfig = nextJest({
  dir: "./",
});

const config = {
  coverageProvider: "v8",
  testEnvironment: "node",
  setupFilesAfterEnv: ["<rootDir>/__tests__/config/jest-profiles/security.setup.mjs"],
  testMatch: [
    "<rootDir>/__tests__/security/**/*.test.{js,ts}",
    "<rootDir>/__tests__/examples/security-*.test.{js,ts}",
  ],
  collectCoverageFrom: [
    "lib/security/**/*.{js,ts}",
    "lib/auth-security.ts",
    "lib/rate-limit.ts",
    "!**/*.d.ts",
    "!**/node_modules/**",
  ],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
};

export default createJestConfig(config);
