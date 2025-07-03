import nextJest from "next/jest.js";

const createJestConfig = nextJest({
  dir: "./",
});

const config = {
  coverageProvider: "v8",
  testEnvironment: "node",
  setupFilesAfterEnv: ["<rootDir>/__tests__/config/jest-profiles/api.setup.mjs"],
  testMatch: [
    "<rootDir>/__tests__/api/**/*.test.{js,ts}",
    "<rootDir>/__tests__/examples/api-*.test.{js,ts}",
  ],
  collectCoverageFrom: ["app/api/**/*.{js,ts}", "!**/*.d.ts", "!**/node_modules/**"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
};

export default createJestConfig(config);
