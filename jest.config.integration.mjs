import nextJest from "next/jest.js";

const createJestConfig = nextJest({
  dir: "./",
});

const config = {
  coverageProvider: "v8",
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/__tests__/config/jest-profiles/integration.setup.mjs"],
  testMatch: [
    "<rootDir>/__tests__/pages/**/*.test.{js,ts,tsx}",
    "<rootDir>/__tests__/**/integration/**/*.test.{js,ts,tsx}",
  ],
  collectCoverageFrom: [
    "app/**/*.{js,ts,tsx}",
    "components/**/*.{js,ts,tsx}",
    "lib/**/*.{js,ts}",
    "!**/*.d.ts",
    "!**/node_modules/**",
  ],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
};

export default createJestConfig(config);
