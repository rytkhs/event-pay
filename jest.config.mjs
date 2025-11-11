/** @type {import('jest').Config} */
const config = {
  testMatch: ["<rootDir>/tests/**/?(*.)+(spec|test).[tj]s?(x)"],
  testPathIgnorePatterns: ["/node_modules/", "/tests/e2e/"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup/jest-setup.ts"],
  transform: {
    "^.+\\.(ts|tsx)$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.test.json",
        useESM: true,
      },
    ],
  },
  extensionsToTreatAsEsm: [".ts", ".tsx"],
  moduleFileExtensions: ["ts", "tsx", "js", "json"],
  moduleDirectories: ["node_modules", "<rootDir>"],
  moduleNameMapper: {
    // Mock server-only package for Jest tests
    "^server-only$": "<rootDir>/tests/mocks/server-only.js",
    // Mock @opennextjs/cloudflare ESM module for Jest tests
    "^@opennextjs/cloudflare$": "<rootDir>/tests/mocks/opennextjs-cloudflare.js",
    // Mock next/server for Jest tests (provides NextResponse, Request, Response APIs)
    "^next/server$": "<rootDir>/tests/mocks/next-server.js",
    // Mock @upstash packages for unit tests (to avoid ESM issues and actual Redis connections)
    // Note: Integration tests can override these mocks if needed
    "^@upstash/redis$": "<rootDir>/tests/mocks/upstash-redis.js",
    "^@upstash/ratelimit$": "<rootDir>/tests/mocks/upstash-ratelimit.js",
    "^@/(.*)$": "<rootDir>/$1",
    "^@core/(.*)$": "<rootDir>/core/$1",
    "^@features/(.*)$": "<rootDir>/features/$1",
    "^@components/(.*)$": "<rootDir>/components/$1",
    "^@/types/(.*)$": "<rootDir>/types/$1",
    "^@tests/(.*)$": "<rootDir>/tests/$1",
  },
  transformIgnorePatterns: ["node_modules/(?!(@opennextjs/cloudflare|@upstash|uncrypto)/)"],
  testEnvironment: "node",
  collectCoverage: false,
  coverageProvider: "v8",
  collectCoverageFrom: [
    "core/**/*.{ts,tsx}",
    "features/**/*.{ts,tsx}",
    "!**/*.d.ts",
    "!tests/**/*",
    "!**/node_modules/**",
  ],
  coverageDirectory: "tmp/test-artifacts/jest-coverage",
  coverageReporters: ["text", "text-summary", "html", "lcov", "json"],
  coveragePathIgnorePatterns: [
    "/node_modules/",
    "/tests/",
    "/.next/",
    "/*.config.{js,mjs,ts}",
    "/types/",
  ],
  reporters: [
    "default",
    ["jest-junit", { outputDirectory: "tmp/test-artifacts", outputName: "junit.xml" }],
  ],
  verbose: true,
};

export default config;
