import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/auth-flow.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ["html", { outputFolder: "playwright-report-performance" }],
    ["json", { outputFile: "test-results-performance.json" }],
  ],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "Performance Tests",
      use: {
        // Chromium with performance monitoring
        channel: "chrome",
        launchOptions: {
          args: [
            "--enable-precise-memory-info",
            "--enable-gpu-benchmarking",
            "--disable-backgrounding-occluded-windows",
            "--disable-renderer-backgrounding",
          ],
        },
      },
    },
  ],
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
});
