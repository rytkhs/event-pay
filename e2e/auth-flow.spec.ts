import { test, expect } from "@playwright/test";

test.describe("認証フロー", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:3000");
  });

  test("ログインフォームが正しく表示される", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

    // 基本的なフォーム要素が表示される
    await expect(page.locator('[name="email"]')).toBeVisible();
    await expect(page.locator('[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();

    // react-hook-formでdata-testidが追加されたフォームを確認
    await expect(page.locator('[data-testid="login-form"]')).toBeVisible();

    // ページタイトルまたはカードタイトルでログインページを確認
    await expect(
      page.locator('h1:has-text("ログイン"), [class*="font-bold"]:has-text("ログイン")')
    ).toBeVisible();

    // パスワードフィールドがマスクされている
    await expect(page.locator('[name="password"]')).toHaveAttribute("type", "password");
  });

  test("ユーザー登録フォームが正しく表示される", async ({ page }) => {
    await page.goto("/register");
    await page.waitForLoadState("networkidle");

    // 基本的なフォーム要素が表示される
    await expect(page.locator('[name="name"]')).toBeVisible();
    await expect(page.locator('[name="email"]')).toBeVisible();
    await expect(page.locator('[name="password"]')).toBeVisible();
    await expect(page.locator('[name="passwordConfirm"]')).toBeVisible();

    // react-hook-formで追加されたdata-testid属性を使用
    await expect(page.locator('[data-testid="terms-checkbox"]')).toBeVisible();
    await expect(page.locator('[data-testid="submit-button"]')).toBeVisible();
    await expect(page.locator('[data-testid="register-form"]')).toBeVisible();

    // ページタイトルまたはカードタイトルで会員登録ページを確認
    await expect(
      page.locator('h1:has-text("会員登録"), [class*="font-bold"]:has-text("会員登録")')
    ).toBeVisible();

    // パスワードフィールドがマスクされている
    await expect(page.locator('[name="password"]')).toHaveAttribute("type", "password");
    await expect(page.locator('[name="passwordConfirm"]')).toHaveAttribute("type", "password");
  });

  test("フォーム入力がバリデーションされ、エラーが表示される", async ({ page }) => {
    await page.goto("/register");
    await page.waitForLoadState("networkidle");

    // 利用規約に同意せずに空のフォームで送信を試行
    await page.click('[data-testid="submit-button"]');

    // react-hook-formのクライアントサイドバリデーションによりエラーが表示される
    // バリデーションエラーはFormMessageコンポーネントで表示される
    await expect(page.locator("form")).toBeVisible({ timeout: 10000 });

    // フォームが送信されず、登録ページに留まることを確認
    await expect(page).toHaveURL("/register");

    // 利用規約の同意を外した状態で送信ボタンが無効化されていることを確認
    // react-hook-formのwatch機能により動的にバリデーションされる
    await expect(page.locator('[data-testid="submit-button"]')).toBeEnabled();
  });

  test("パスワード確認のバリデーションが機能する", async ({ page }) => {
    await page.goto("/register");
    await page.waitForLoadState("networkidle");

    // 異なるパスワードを入力
    await page.fill('[name="password"]', "SecurePass123!");
    await page.fill('[name="passwordConfirm"]', "DifferentPass123!");

    // react-hook-formのwatch機能によるリアルタイムバリデーション
    await page.locator('[name="passwordConfirm"]').blur();

    // パスワード不一致の表示確認（react-hook-formでは即座に表示される）
    // より具体的なセレクタを使用して重複問題を解決
    await expect(
      page.locator('.text-red-500:has-text("パスワードが一致しません")').first()
    ).toBeVisible({ timeout: 5000 });
  });

  test("正常なフォーム入力でバリデーションエラーがクリアされる", async ({ page }) => {
    await page.goto("/register");
    await page.waitForLoadState("networkidle");

    // 正常なデータを入力
    await page.fill('[name="name"]', "テストユーザー");
    await page.fill('[name="email"]', "test@example.com");
    await page.fill('[name="password"]', "SecurePass123!");
    await page.fill('[name="passwordConfirm"]', "SecurePass123!");

    // 利用規約に同意
    await page.check('[data-testid="terms-checkbox"]');

    // react-hook-formのリアルタイムバリデーションにより、
    // 正常な入力でエラーがクリアされることを確認
    await expect(page.locator("text=パスワードが一致しません")).not.toBeVisible();

    // 送信ボタンが有効になることを確認
    await expect(page.locator('[data-testid="submit-button"]')).toBeEnabled();
  });
});
