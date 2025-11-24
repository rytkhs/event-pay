import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("LINEログインUI検証", () => {
  test("ログインページにLINEログインボタンが表示される", async ({ page }) => {
    // ログインページにアクセス
    await page.goto("/login");

    // LINEログインボタンの存在確認
    const lineButton = page.getByRole("button", { name: "LINEでログイン" });
    await expect(lineButton).toBeVisible();

    // ボタンスタイルの確認（背景色など）
    // Note: CSSクラスの検証は壊れやすいため、機能的な検証を優先するが、
    // 公式カラーが重要なので念のため確認
    await expect(lineButton).toHaveClass(/bg-\[#06C755\]/);

    // リンクの検証
    // ボタンの親要素がリンクになっている構造
    const lineLink = page.locator("a[href^='/auth/line']");
    await expect(lineLink).toBeVisible();

    // href属性の検証
    const href = await lineLink.getAttribute("href");
    expect(href).toMatch(/^\/auth\/line/);
  });

  test("redirectToパラメータがLINEログインリンクに引き継がれる", async ({ page }) => {
    // redirectToパラメータ付きでログインページにアクセス
    const returnUrl = "/events/123";
    await page.goto(`/login?redirectTo=${encodeURIComponent(returnUrl)}`);

    // リンクのhrefにnextパラメータが含まれていることを確認
    const lineLink = page.locator("a[href^='/auth/line']");
    const href = await lineLink.getAttribute("href");

    // URLデコードして検証
    const decodedHref = decodeURIComponent(href || "");
    expect(decodedHref).toContain(`next=${returnUrl}`);
  });

  test("LINEログインボタンをクリックすると認証エンドポイントへ遷移する", async ({ page }) => {
    await page.goto("/login");

    // リクエストをインターセプトして検証
    // 実際にLINEへリダイレクトされる前の /auth/line へのリクエストを捕捉
    const requestPromise = page.waitForRequest(
      (request) => request.url().includes("/auth/line") && request.method() === "GET"
    );

    // ボタン（リンク）をクリック
    await page.getByRole("button", { name: "LINEでログイン" }).click();

    // リクエストが発生したことを確認
    const request = await requestPromise;
    expect(request).toBeTruthy();
  });
});
