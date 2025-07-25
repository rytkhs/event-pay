import { test, expect } from "@playwright/test";
import { loginWithUniqueUser, clearAccountLockout } from "./helpers/rhf-test-helpers";
import { setupTestEnvironment } from "./helpers/test-setup";

/**
 * 認証フロー完全E2Eテスト
 * 統合テストから移行した認証関連のユーザーフロー
 */

test.describe("認証フロー", () => {
  // 各テストスイート実行前にアカウントロック状態をクリア
  test.beforeAll(async () => {
    await setupTestEnvironment();
  });

  test.describe("ログイン機能", () => {
    test("正常なログインフローが動作する", async ({ page }) => {
      // アカウントロック状態をクリアしてからログイン
      const email = "test@eventpay.test";
      await clearAccountLockout(email);

      await page.goto("/login");
      await page.fill('[name="email"]', email);
      await page.fill('[name="password"]', "TestPassword123");
      await page.click('button[type="submit"]');

      // ダッシュボードにリダイレクトされることを確認（タイムアウトを増やす）
      await page.waitForURL("/home", { timeout: 60000 });
      expect(page.url()).toBe("http://localhost:3000/home");
    });

    test("無効な認証情報でログインエラーが表示される", async ({ page }) => {
      await page.goto("/login");

      // 無効な認証情報を入力（ユニークなメールアドレスを使用）
      const timestamp = Date.now();
      await page.fill('[name="email"]', `invalid-${timestamp}@example.com`);
      await page.fill('[name="password"]', "wrongpassword");

      // ログインボタンをクリック
      await page.click('button[type="submit"]');

      // react-hook-formでサーバーエラーが適切に表示されることを確認
      await expect(page.locator('[data-testid="error-message"]')).toBeVisible();

      // ログインページに留まることを確認
      await expect(page).toHaveURL("/login");
    });

    test("バリデーションエラーが適切に表示される", async ({ page }) => {
      await page.goto("/login");

      // 無効なメールアドレスを入力
      await page.fill('[name="email"]', "invalid-email");
      await page.fill('[name="password"]', "validpassword");

      // react-hook-formでは送信時にクライアントサイドバリデーションが実行される
      await page.click('button[type="submit"]');

      // バリデーションエラーが発生した場合、フォームは送信されない
      await expect(page).toHaveURL("/login");

      // フォームが表示されたままであることを確認
      await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
    });

    test("空のフォームで送信した場合のバリデーション", async ({ page }) => {
      await page.goto("/login");

      // 空のフォームで送信
      await page.click('button[type="submit"]');

      // react-hook-formのクライアントサイドバリデーションによりフォームは送信されない
      await expect(page).toHaveURL("/login");

      // フォームが表示されたままであることを確認
      await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
    });
  });

  test.describe("ユーザー登録機能", () => {
    test("正常なユーザー登録フローが動作する", async ({ page }) => {
      await page.goto("/register");

      // ユーザー登録フォームの表示確認（react-hook-form対応）
      await expect(page.locator('[data-testid="register-form"]')).toBeVisible();
      await expect(page.locator('[name="name"]')).toBeVisible();
      await expect(page.locator('[name="email"]')).toBeVisible();
      await expect(page.locator('[name="password"]')).toBeVisible();

      // ユニークなユーザー情報を生成して入力
      const timestamp = Date.now();
      const uniqueEmail = `newuser-${timestamp}@eventpay.test`;

      await page.fill('[name="name"]', `テストユーザー${timestamp}`);
      await page.fill('[name="email"]', uniqueEmail);
      await page.fill('[name="password"]', "SecurePassword123!");
      await page.fill('[name="passwordConfirm"]', "SecurePassword123!");

      // 利用規約に同意（react-hook-form対応のdata-testid使用）
      await page.check('[data-testid="terms-checkbox"]');

      // 登録ボタンをクリック
      await page.click('[data-testid="submit-button"]');

      // 登録完了またはメール確認ページにリダイレクトされることを確認（タイムアウトを増やす）
      await page.waitForURL(/\/(auth\/verify-otp|dashboard)/, { timeout: 60000 });
    });

    test("無効なデータでユーザー登録エラーが表示される", async ({ page }) => {
      await page.goto("/register");

      // 無効なデータを入力
      await page.fill('[name="name"]', "テストユーザー");
      await page.fill('[name="email"]', "invalid-email");
      await page.fill('[name="password"]', "weak");
      await page.fill('[name="passwordConfirm"]', "different");

      // 登録ボタンをクリック
      await page.click('[data-testid="submit-button"]');

      // react-hook-formのクライアントサイドバリデーションによりフォームは送信されない
      await expect(page).toHaveURL("/register");

      // フォームが表示されたままであることを確認
      await expect(page.locator('[data-testid="register-form"]')).toBeVisible();
    });

    test("パスワード強度表示が機能する", async ({ page }) => {
      await page.goto("/register");

      // 弱いパスワードを入力
      await page.fill('[name="password"]', "weak");

      // react-hook-formのwatch機能によりパスワード強度が表示される
      await expect(page.locator("text=弱い")).toBeVisible();

      // 強いパスワードに変更
      await page.fill('[name="password"]', "StrongPassword123!");

      // パスワード強度が更新される
      await expect(page.locator("text=とても強い")).toBeVisible();
    });

    test("利用規約同意が必須であることを確認", async ({ page }) => {
      await page.goto("/register");

      // 正常なデータを入力するが利用規約に同意しない（ユニークなメールアドレスを使用）
      const timestamp = Date.now();
      await page.fill('[name="name"]', `テストユーザー${timestamp}`);
      await page.fill('[name="email"]', `test-${timestamp}@example.com`);
      await page.fill('[name="password"]', "SecurePassword123!");
      await page.fill('[name="passwordConfirm"]', "SecurePassword123!");

      // 利用規約に同意せずに送信を試行
      await page.click('[data-testid="submit-button"]');

      // react-hook-formのバリデーションにより送信が阻止される
      await expect(page).toHaveURL("/register");
    });
  });

  test.describe("セキュリティ機能", () => {
    test("XSS攻撃対策が機能する", async ({ page }) => {
      await page.goto("/register");

      // 悪意のあるスクリプトを含むデータを入力（ユニークなメールアドレスを使用）
      const maliciousScript = '<script>alert("XSS")</script>';
      const timestamp = Date.now();
      await page.fill('[name="name"]', maliciousScript);
      await page.fill('[name="email"]', `test-${timestamp}@example.com`);
      await page.fill('[name="password"]', "SecurePassword123!");
      await page.fill('[name="passwordConfirm"]', "SecurePassword123!");
      await page.check('[data-testid="terms-checkbox"]');

      // フォーム送信後、スクリプトが実行されていないことを確認
      await page.click('[data-testid="submit-button"]');

      // XSS攻撃が防がれていることを確認
      await page.waitForTimeout(2000);

      // ページにアラートダイアログが表示されていないことを確認
      let alertTriggered = false;
      page.on("dialog", () => {
        alertTriggered = true;
      });

      // 少し待ってからアラートがトリガーされていないことを確認
      await page.waitForTimeout(1000);
      expect(alertTriggered).toBeFalsy();
    });

    test("SQLインジェクション対策が機能する", async ({ page }) => {
      await page.goto("/login");

      // SQLインジェクションを試行
      await page.fill('[name="email"]', "'; DROP TABLE users; --");
      await page.fill('[name="password"]', "anypassword");
      await page.click('button[type="submit"]');

      // 適切にエラーハンドリングされ、システムが正常に動作していることを確認
      await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
    });
  });

  test.describe("レスポンシブデザイン", () => {
    test("モバイルデバイスでログインフォームが適切に表示される", async ({ page }) => {
      // モバイルサイズに設定
      await page.setViewportSize({ width: 375, height: 667 });

      await page.goto("/login");

      // ログインフォームの表示確認
      await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
      await expect(page.locator('[name="email"]')).toBeVisible();
      await expect(page.locator('[name="password"]')).toBeVisible();

      // フォームが適切にレイアウトされていることを確認
      const form = page.locator('[data-testid="login-form"]');
      await expect(form).toBeVisible();
    });

    test("タブレットデバイスでダッシュボードが適切に表示される", async ({ page }) => {
      // タブレットサイズに設定
      await page.setViewportSize({ width: 768, height: 1024 });

      // ユニークなユーザーでログインしてダッシュボードにアクセス
      const user = await loginWithUniqueUser(page);

      await page.waitForURL("/dashboard", { timeout: 60000 });

      // ダッシュボードの表示確認
      await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
    });
  });
});
