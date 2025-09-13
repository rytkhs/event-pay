import { test, expect } from "@playwright/test";

test.describe("ホームページ", () => {
  test("ユーザーがログインしている場合、ダッシュボードのコンテンツが正しく表示される", async ({
    page,
  }) => {
    // 認証済みの状態で直接ホームページにアクセス
    await page.goto("/dashboard");

    // 「EventPay ダッシュボード」という見出しが表示されていることを確認
    await expect(page.getByRole("heading", { name: "EventPay ダッシュボード" })).toBeVisible();

    // ログイン成功メッセージが表示されていることを確認
    await expect(page.getByRole("heading", { name: "🎉 ログイン成功！" })).toBeVisible();

    // ユーザー情報セクションが表示されていることを確認
    await expect(page.getByRole("heading", { name: "ユーザー情報" })).toBeVisible();

    // ログアウトボタンが表示されていることを確認
    await expect(page.getByRole("button", { name: "ログアウト" })).toBeVisible();
  });
});
