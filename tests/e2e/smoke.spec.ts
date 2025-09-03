import { test, expect } from "@playwright/test";

const shouldRun = process.env.RUN_E2E_SMOKE === "1";

(shouldRun ? test : test.skip)("smoke: open home or login", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
  const url = page.url();
  expect(url === "http://localhost:3000/" || url.startsWith("http://localhost:3000/login")).toBe(
    true
  );
});
