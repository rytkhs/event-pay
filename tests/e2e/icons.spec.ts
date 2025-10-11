import { test, expect } from "@playwright/test";

test.describe("icons", () => {
  test("should expose icon links in head", async ({ page }) => {
    await page.goto("/");
    const links = await page.locator(
      'head link[rel="icon"], head link[rel="apple-touch-icon"], head link[rel="mask-icon"]'
    );

    // SVG icon, favicon.ico, apple-touch-icon, mask-icon = 4 links
    await expect(links).toHaveCount(4);

    // verify each href resolves with 200
    const hrefs = await links.evaluateAll((els) => els.map((e) => (e as HTMLLinkElement).href));
    for (const href of hrefs) {
      const res = await page.request.get(href);
      expect(res.ok()).toBeTruthy();
    }
  });

  test("should have correct content-types for each icon", async ({ page }) => {
    await page.goto("/");

    // SVG icon
    const svgIcon = await page.locator('head link[rel="icon"][type="image/svg+xml"]').first();
    expect(await svgIcon.getAttribute("href")).toContain("/icon.svg");
    expect(await svgIcon.getAttribute("sizes")).toBe("any");

    // favicon.ico
    const faviconIco = await page.locator('head link[rel="icon"][href="/favicon.ico"]').first();
    expect(await faviconIco.getAttribute("sizes")).toBe("48x48");

    // Apple touch icon
    const appleIcon = await page.locator('head link[rel="apple-touch-icon"]').first();
    expect(await appleIcon.getAttribute("href")).toContain("/apple-icon");
    expect(await appleIcon.getAttribute("sizes")).toBe("180x180");
    expect(await appleIcon.getAttribute("type")).toBe("image/png");

    // Safari mask icon
    const maskIcon = await page.locator('head link[rel="mask-icon"]').first();
    expect(await maskIcon.getAttribute("href")).toBe("/safari-pinned-tab.svg");
    expect(await maskIcon.getAttribute("color")).toBe("#24a6b5");
  });

  test("should serve icons with correct content-type headers", async ({ page }) => {
    // Test SVG icon
    const svgRes = await page.request.get("/icon.svg");
    expect(svgRes.ok()).toBeTruthy();
    expect(svgRes.headers()["content-type"]).toContain("image/svg+xml");

    // Test favicon.ico
    const icoRes = await page.request.get("/favicon.ico");
    expect(icoRes.ok()).toBeTruthy();
    expect(icoRes.headers()["content-type"]).toMatch(/image\/(x-icon|vnd\.microsoft\.icon)/);

    // Test safari pinned tab
    const safariRes = await page.request.get("/safari-pinned-tab.svg");
    expect(safariRes.ok()).toBeTruthy();
    expect(safariRes.headers()["content-type"]).toContain("image/svg+xml");

    // Test apple icon (generated dynamically)
    const appleRes = await page.request.get("/apple-icon");
    expect(appleRes.ok()).toBeTruthy();
    expect(appleRes.headers()["content-type"]).toContain("image/png");
  });
});
