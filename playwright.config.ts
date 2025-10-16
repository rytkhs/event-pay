import { defineConfig, devices } from "@playwright/test";

const shouldStartServer = process.env.PLAYWRIGHT_START_SERVER === "1";
const webServer = shouldStartServer
  ? {
      command: process.env.PLAYWRIGHT_WEBSERVER_CMD || "npm run dev",
      url: "http://localhost:3000",
      reuseExistingServer: true,
      timeout: 120 * 1000,
    }
  : undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "tmp/test-artifacts/playwright-results",
  workers: 1,
  fullyParallel: false,
  timeout: 40 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
  reporter: [
    ["list"],
    ["html", { outputFolder: "tmp/test-artifacts/playwright-report", open: "never" }],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    trace: "retain-on-failure",
    video: "on",
    screenshot: "on",
    viewport: { width: 1280, height: 800 },
    timezoneId: "Asia/Tokyo",
  },
  ...(webServer ? { webServer } : {}),
  projects: [
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Use prepared auth state.
        storageState: "playwright/.auth/user.json",
      },
      dependencies: ["setup"],
    },
    {
      name: "chromium-unauthenticated",
      use: {
        ...devices["Desktop Chrome"],
        // No authentication state (for registration, login tests)
        storageState: { cookies: [], origins: [] },
      },
    },
  ],
});
