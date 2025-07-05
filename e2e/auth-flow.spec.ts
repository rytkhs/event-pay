import { test, expect } from "@playwright/test";

test.describe("認証フロー", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:3000");
  });

  test("ログインフォームが正しく表示される", async ({ page }) => {
    await page.goto("/auth/login");
    await page.waitForLoadState("networkidle");

    // 基本的なフォーム要素が表示される
    await expect(page.locator('[name="email"]')).toBeVisible();
    await expect(page.locator('[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
    await expect(page.locator("h1")).toContainText("ログイン");

    // パスワードフィールドがマスクされている
    await expect(page.locator('[name="password"]')).toHaveAttribute("type", "password");
  });

  test("ユーザー登録フォームが正しく表示される", async ({ page }) => {
    await page.goto("/auth/register");
    await page.waitForLoadState("networkidle");

    // 基本的なフォーム要素が表示される
    await expect(page.locator('[name="name"]')).toBeVisible();
    await expect(page.locator('[name="email"]')).toBeVisible();
    await expect(page.locator('[name="password"]')).toBeVisible();
    await expect(page.locator('[name="passwordConfirm"]')).toBeVisible();
    await expect(page.locator("#terms-agreement")).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
    await expect(page.locator("h1")).toContainText("ユーザー登録");

    // パスワードフィールドがマスクされている
    await expect(page.locator('[name="password"]')).toHaveAttribute("type", "password");
    await expect(page.locator('[name="passwordConfirm"]')).toHaveAttribute("type", "password");
  });

  test("フォーム入力がバリデーションされ、エラーが表示される", async ({ page }) => {
    await page.goto("/auth/register");
    await page.waitForLoadState("networkidle");

    // 利用規約に同意してから送信（空のフォームで）
    await page.check("#terms-agreement");
    await page.click('button[type="submit"]');

    // エラーメッセージが表示される（フィールドバリデーション）
    await expect(page.locator('[role="alert"]').first()).toBeVisible({ timeout: 10000 });

    // 利用規約の同意を外す
    await page.uncheck("#terms-agreement");
    await page.waitForTimeout(200);

    // 送信ボタンが無効化されているを確認
    await expect(page.locator('button[type="submit"]')).toBeDisabled();
  });

  test("パスワード確認のバリデーションが機能する", async ({ page }) => {
    await page.goto("/auth/register");
    await page.waitForLoadState("networkidle");

    // 異なるパスワードを入力
    await page.fill('[name="password"]', "SecurePass123!");
    await page.fill('[name="passwordConfirm"]', "DifferentPass123!");
    await page.locator('[name="passwordConfirm"]').blur();

    // パスワード不一致の視覚的フィードバックが表示される
    // 実際のエラー表示要素を確認
    const errorElement = page.locator('[role="alert"]').first();
    await expect(errorElement).toBeVisible({ timeout: 10000 });
  });

  test("セキュリティ基準が維持される", async ({ page }) => {
    await page.goto("/auth/register");
    await page.waitForLoadState("networkidle");

    // 送信ボタンが初期状態で無効化されている
    await expect(page.locator('button[type="submit"]')).toBeDisabled();

    // 利用規約に同意すると送信ボタンが有効化される
    await page.check("#terms-agreement");
    // Wait for React state update with shorter timeout
    await page.waitForTimeout(200);
    await expect(page.locator('button[type="submit"]')).toBeEnabled();

    // 利用規約の同意を外すと再び無効化される
    await page.uncheck("#terms-agreement");
    await page.waitForTimeout(200);
    await expect(page.locator('button[type="submit"]')).toBeDisabled();
  });

  test("モバイルレスポンシブに対応している", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/auth/register");
    await page.waitForLoadState("networkidle");

    // モバイルビューでフォームが適切に表示される
    await expect(page.locator("form")).toBeVisible();
    await expect(page.locator('[name="name"]')).toBeVisible();
    await expect(page.locator('[name="email"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();

    // タッチターゲットのサイズが適切である
    const submitButton = page.locator('button[type="submit"]');
    const bbox = await submitButton.boundingBox();
    expect(bbox?.height).toBeGreaterThan(44); // 44px以上のタッチターゲット
  });
});
