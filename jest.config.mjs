/** @type {import('jest').Config} */
const config = {
  testMatch: ["<rootDir>/tests/**/?(*.)+(spec|test).[tj]s?(x)"],
  testPathIgnorePatterns: ["/node_modules/", "/tests/e2e/"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup/jest-setup.ts"],
  transform: {
    "^.+\\.(ts|tsx)$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.json",
        useESM: true,
      },
    ],
  },
  extensionsToTreatAsEsm: [".ts", ".tsx"],
  moduleFileExtensions: ["ts", "tsx", "js", "json"],
  moduleDirectories: ["node_modules", "<rootDir>"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^@core/(.*)$": "<rootDir>/core/$1",
    "^@features/(.*)$": "<rootDir>/features/$1",
    "^@components/(.*)$": "<rootDir>/components/$1",
    "^@/types/(.*)$": "<rootDir>/types/$1",
  },
  testEnvironment: "node",
  collectCoverage: true,
  coverageProvider: "v8",
  collectCoverageFrom: [
    "core/**/*.{ts,tsx}",
    "features/**/*.{ts,tsx}",
    "!**/*.d.ts",
    "!tests/**/*",
    "!**/node_modules/**",
  ],
  coverageDirectory: "tmp/test-artifacts/jest-coverage",
  coverageThreshold: {
    global: {
      statements: 50,
      branches: 50,
      functions: 50,
      lines: 50,
    },
  },
  reporters: [
    "default",
    ["jest-junit", { outputDirectory: "tmp/test-artifacts", outputName: "junit.xml" }],
  ],
  verbose: true,
};

export default config;
