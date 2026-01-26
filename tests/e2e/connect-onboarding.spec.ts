import { test, expect } from "@playwright/test";

test.describe("Stripe Connect オンボーディング", () => {
  test("ダッシュボードから設定開始UIが表示される", async ({ page }) => {
    // 事前に認証済みセッションをセットアップするテストユーティリティがある前提
    // ない場合は /login 経由のログインフローを利用
    await page.goto("/dashboard/connect");
    await expect(page.getByRole("heading", { name: "売上受取設定" })).toBeVisible();
    await expect(page.getByRole("button", { name: "設定を始める" })).toBeVisible();
  });
});
