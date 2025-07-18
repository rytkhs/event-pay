import { test, expect } from "@playwright/test";

/**
 * 認証フロー完全E2Eテスト
 * 統合テストから移行した認証関連のユーザーフロー
 */

test.describe("認証フロー", () => {
  test.describe("ログイン機能", () => {
    test("正常なログインフローが動作する", async ({ page }) => {
      await page.goto("/auth/login");

      // ログインフォームの表示確認
      await expect(page.locator('[data-testid="login-form"]')).toBeVisible();
      await expect(page.locator('[name="email"]')).toBeVisible();
      await expect(page.locator('[name="password"]')).toBeVisible();

      // 認証情報を入力
      await page.fill('[name="email"]', "test@eventpay.test");
      await page.fill('[name="password"]', "testpassword123");

      // ログインボタンをクリック
      await page.click('button[type="submit"]');

      // ダッシュボードにリダイレクトされることを確認
      await page.waitForURL("/dashboard");
      await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
    });

    test("無効な認証情報でログインエラーが表示される", async ({ page }) => {
      await page.goto("/auth/login");

      // 無効な認証情報を入力
      await page.fill('[name="email"]', "invalid@example.com");
      await page.fill('[name="password"]', "wrongpassword");

      // ログインボタンをクリック
      await page.click('button[type="submit"]');

      // エラーメッセージが表示されることを確認
      await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
      await expect(page.locator('[data-testid="error-message"]')).toContainText(
        "認証に失敗しました"
      );

      // ログインページに留まることを確認
      await expect(page).toHaveURL("/auth/login");
    });

    test("バリデーションエラーが適切に表示される", async ({ page }) => {
      await page.goto("/auth/login");

      // 空のフォームで送信
      await page.click('button[type="submit"]');

      // バリデーションエラーが表示されることを確認
      await expect(page.locator('[data-testid="email-error"]')).toBeVisible();
      await expect(page.locator('[data-testid="password-error"]')).toBeVisible();

      // 無効なメールアドレスを入力
      await page.fill('[name="email"]', "invalid-email");
      await page.click('button[type="submit"]');

      // メールアドレスのバリデーションエラーを確認
      await expect(page.locator('[data-testid="email-error"]')).toContainText(
        "有効なメールアドレスを入力してください"
      );
    });
  });

  test.describe("ログアウト機能", () => {
    test.beforeEach(async ({ page }) => {
      // テスト用ユーザーでログイン
      await page.goto("/auth/login");
      await page.fill('[name="email"]', "test@eventpay.test");
      await page.fill('[name="password"]', "testpassword123");
      await page.click('button[type="submit"]');
      await page.waitForURL("/dashboard");
    });

    test("ログアウトが正常に動作する", async ({ page }) => {
      // ユーザーメニューを開く
      await page.click('[data-testid="user-menu"]');

      // ログアウトボタンをクリック
      await page.click('[data-testid="logout-button"]');

      // ログインページにリダイレクトされることを確認
      await page.waitForURL("/auth/login");

      // 再度ダッシュボードにアクセスしてもログインページにリダイレクトされることを確認
      await page.goto("/dashboard");
      await page.waitForURL("/auth/login");
    });
  });

  test.describe("パスワードリセット機能", () => {
    test("パスワードリセットフローが動作する", async ({ page }) => {
      await page.goto("/auth/login");

      // パスワードを忘れた場合のリンクをクリック
      await page.click('[data-testid="forgot-password-link"]');
      await page.waitForURL("/auth/reset-password");

      // パスワードリセットフォームが表示されることを確認
      await expect(page.locator('[data-testid="reset-password-form"]')).toBeVisible();

      // メールアドレスを入力
      await page.fill('[name="email"]', "test@eventpay.test");

      // リセットリンク送信ボタンをクリック
      await page.click('button[type="submit"]');

      // 成功メッセージが表示されることを確認
      await expect(page.locator('[data-testid="success-message"]')).toBeVisible();
      await expect(page.locator('[data-testid="success-message"]')).toContainText(
        "パスワードリセットリンクを送信しました"
      );
    });

    test("無効なメールアドレスでリセットエラーが表示される", async ({ page }) => {
      await page.goto("/auth/reset-password");

      // 無効なメールアドレスを入力
      await page.fill('[name="email"]', "nonexistent@example.com");

      // リセットリンク送信ボタンをクリック
      await page.click('button[type="submit"]');

      // エラーメッセージが表示されることを確認
      await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
      await expect(page.locator('[data-testid="error-message"]')).toContainText(
        "該当するユーザーが見つかりません"
      );
    });
  });

  test.describe("セッション管理", () => {
    test("セッションの永続化が正常に動作する", async ({ page }) => {
      // ログイン
      await page.goto("/auth/login");
      await page.fill('[name="email"]', "test@eventpay.test");
      await page.fill('[name="password"]', "testpassword123");
      await page.click('button[type="submit"]');
      await page.waitForURL("/dashboard");

      // ページをリロード
      await page.reload();

      // ログイン状態が維持されることを確認
      await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
      await expect(page).toHaveURL("/dashboard");
    });

    test("セッション期限切れ時の適切なリダイレクト", async ({ page }) => {
      // ログイン
      await page.goto("/auth/login");
      await page.fill('[name="email"]', "test@eventpay.test");
      await page.fill('[name="password"]', "testpassword123");
      await page.click('button[type="submit"]');
      await page.waitForURL("/dashboard");

      // セッションクッキーを削除してセッション期限切れをシミュレート
      await page.context().clearCookies();

      // 保護されたページにアクセス
      await page.goto("/events/new");

      // ログインページにリダイレクトされることを確認
      await page.waitForURL("/auth/login");

      // リダイレクト後のメッセージを確認
      await expect(page.locator('[data-testid="session-expired-message"]')).toBeVisible();
    });
  });

  test.describe("認証状態の可視化", () => {
    test("未認証状態でのナビゲーション表示", async ({ page }) => {
      await page.goto("/");

      // 未認証状態でのナビゲーションを確認
      await expect(page.locator('[data-testid="login-button"]')).toBeVisible();
      await expect(page.locator('[data-testid="signup-button"]')).toBeVisible();
      await expect(page.locator('[data-testid="user-menu"]')).not.toBeVisible();
    });

    test("認証状態でのナビゲーション表示", async ({ page }) => {
      // ログイン
      await page.goto("/auth/login");
      await page.fill('[name="email"]', "test@eventpay.test");
      await page.fill('[name="password"]', "testpassword123");
      await page.click('button[type="submit"]');
      await page.waitForURL("/dashboard");

      // 認証状態でのナビゲーションを確認
      await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
      await expect(page.locator('[data-testid="login-button"]')).not.toBeVisible();
      await expect(page.locator('[data-testid="signup-button"]')).not.toBeVisible();

      // ユーザー情報が表示されることを確認
      await page.click('[data-testid="user-menu"]');
      await expect(page.locator('[data-testid="user-email"]')).toBeVisible();
      await expect(page.locator('[data-testid="user-email"]')).toContainText("test@eventpay.test");
    });
  });
});
