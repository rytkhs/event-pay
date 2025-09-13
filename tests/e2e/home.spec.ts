import { test, expect } from "@playwright/test";

test.describe("ホームページ", () => {
  test("ユーザーがログインしている場合、ダッシュボードのコンテンツが正しく表示される", async ({
    page,
  }) => {
    // 認証済みの状態で直接ホームページにアクセス
    await page.goto("/dashboard");

    // ログアウトボタンが表示されていることを確認
    await expect(page.getByRole("button", { name: "ログアウト" })).toBeVisible();
  });
});
