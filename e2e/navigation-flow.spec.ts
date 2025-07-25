import { test, expect } from "@playwright/test";

/**
 * ナビゲーションフローE2Eテスト
 * 統合テストで削除された複雑なナビゲーションロジックを実環境で検証
 * redirect、routing、URL変更などの動作をテスト
 */

test.describe("アプリケーションナビゲーション", () => {
  test.beforeEach(async ({ page }) => {
    // 確認済みのテストユーザーでログイン
    await page.goto("/login");
    await page.fill('[name="email"]', "test@eventpay.test");
    await page.fill('[name="password"]', "TestPassword123");
    await page.click('button[type="submit"]');
    await page.waitForURL("/home", { timeout: 60000 });
  });

  test.describe("イベント詳細ナビゲーション", () => {
    test("イベント詳細ページから編集ページへの遷移", async ({ page }) => {
      // イベント一覧ページに移動
      await page.goto("/events");
      await page.waitForLoadState("networkidle");

      // 最初のイベントをクリック
      const eventLinks = page.locator('[data-testid*="event-card"]').first();
      await eventLinks.click();

      // イベント詳細ページの読み込みを待機
      await page.waitForURL(/\/events\/[^\/]+$/, { timeout: 10000 });

      // 編集ボタンをクリック
      const editButton = page.locator('[data-testid="edit-event-button"]');
      await editButton.click();

      // 編集ページへの遷移を確認
      await page.waitForURL(/\/events\/[^\/]+\/edit/, { timeout: 10000 });

      // 編集フォームが表示されることを確認
      await expect(page.locator('input[name="title"]')).toBeVisible();
      await expect(page.locator('[data-testid="save-changes-button"]')).toBeVisible();
    });

    test("存在しないイベントページへのアクセス時のリダイレクト", async ({ page }) => {
      // 存在しないイベントIDでアクセス
      await page.goto("/events/non-existent-event-id");

      // 適切なエラーページまたは一覧ページにリダイレクトされることを確認
      await page.waitForLoadState("networkidle");

      // エラーメッセージまたは一覧ページが表示される
      const isErrorPage = await page.locator('[data-testid="error-message"]').isVisible();
      const isEventsListPage = await page.locator('[data-testid="events-list"]').isVisible();

      expect(isErrorPage || isEventsListPage).toBe(true);
    });
  });

  test.describe("認証が必要なページアクセス", () => {
    test("ログアウト後の保護されたページアクセス", async ({ page }) => {
      // ログアウト
      await page.click('[data-testid="user-menu-button"]');
      await page.click('[data-testid="logout-button"]');
      await page.waitForURL("/", { timeout: 10000 });

      // イベント作成ページに直接アクセス（認証が必要）
      await page.goto("/events/create");

      // ログインページにリダイレクトされることを確認
      await page.waitForURL(/\/(login|auth)/, { timeout: 10000 });

      // ログインフォームが表示されることを確認
      await expect(page.locator('input[name="email"]')).toBeVisible();
      await expect(page.locator('input[name="password"]')).toBeVisible();
    });
  });

  test.describe("フォーム送信後のナビゲーション", () => {
    test("イベント作成成功後の詳細ページリダイレクト", async ({ page }) => {
      // イベント作成ページに移動
      await page.goto("/events/create");
      await page.waitForLoadState("networkidle");

      // イベント基本情報を入力
      await page.fill('input[name="title"]', `E2Eナビテスト-${Date.now()}`);

      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 1);
      const futureDateString = futureDate.toISOString().slice(0, 16);
      await page.fill('input[name="date"]', futureDateString);

      await page.fill('input[name="fee"]', "0");
      await page.fill('textarea[name="description"]', "E2Eナビゲーションテスト");
      await page.fill('input[name="location"]', "テスト会場");

      // フォーム送信
      await page.click('button[type="submit"]');

      // 作成成功後、詳細ページにリダイレクトされることを確認
      await page.waitForURL(/\/events\/[^\/]+$/, { timeout: 15000 });

      // 作成したイベントの詳細が表示されることを確認
      await expect(page.locator("h1")).toContainText("E2Eナビテスト");
      await expect(page.locator('[data-testid="event-description"]')).toContainText(
        "E2Eナビゲーションテスト"
      );
    });

    test("イベント編集成功後の詳細ページ戻り", async ({ page }) => {
      // 既存のイベントを編集するため、一覧から選択
      await page.goto("/events");
      await page.waitForLoadState("networkidle");

      // 最初のイベントの詳細ページに移動
      const firstEventLink = page.locator('[data-testid*="event-card"]').first();
      await firstEventLink.click();
      await page.waitForURL(/\/events\/[^\/]+$/, { timeout: 10000 });

      // 元のタイトルを記録
      const originalTitle = await page.locator("h1").textContent();

      // 編集ページに移動
      await page.click('[data-testid="edit-event-button"]');
      await page.waitForURL(/\/events\/[^\/]+\/edit/, { timeout: 10000 });

      // タイトルを変更
      const updatedTitle = `${originalTitle} (更新済み)`;
      await page.fill('input[name="title"]', updatedTitle);

      // 変更を保存
      await page.click('[data-testid="save-changes-button"]');

      // 詳細ページに戻ることを確認
      await page.waitForURL(/\/events\/[^\/]+$/, { timeout: 15000 });

      // 更新されたタイトルが表示されることを確認
      await expect(page.locator("h1")).toContainText("更新済み");
    });
  });

  test.describe("ブラウザ履歴とナビゲーション", () => {
    test("ブラウザの戻るボタン機能", async ({ page }) => {
      // ホームページから開始
      await page.goto("/home");

      // イベント一覧に移動
      await page.goto("/events");
      await page.waitForLoadState("networkidle");

      // 詳細ページに移動
      const firstEventLink = page.locator('[data-testid*="event-card"]').first();
      await firstEventLink.click();
      await page.waitForURL(/\/events\/[^\/]+$/, { timeout: 10000 });

      // ブラウザの戻るボタンをクリック
      await page.goBack();

      // イベント一覧ページに戻ることを確認
      await expect(page).toHaveURL(/\/events$/);
      await expect(page.locator('[data-testid="events-list"]')).toBeVisible();

      // もう一度戻るボタン
      await page.goBack();

      // ホームページに戻ることを確認
      await expect(page).toHaveURL(/\/(home|dashboard)$/);
    });

    test("ページリロード後の状態維持", async ({ page }) => {
      // イベント詳細ページに移動
      await page.goto("/events");
      await page.waitForLoadState("networkidle");

      const firstEventLink = page.locator('[data-testid*="event-card"]').first();
      await firstEventLink.click();
      await page.waitForURL(/\/events\/[^\/]+$/, { timeout: 10000 });

      // 現在のURLを取得
      const currentURL = page.url();

      // ページをリロード
      await page.reload();
      await page.waitForLoadState("networkidle");

      // 同じページが維持されることを確認
      expect(page.url()).toBe(currentURL);

      // イベント詳細が適切に表示されることを確認
      await expect(page.locator("h1")).toBeVisible();
      await expect(page.locator('[data-testid="event-description"]')).toBeVisible();
    });
  });

  test.describe("エラーハンドリングとナビゲーション", () => {
    test("ネットワークエラー時の適切な表示", async ({ page }) => {
      // ネットワークを無効化
      await page.route("**/api/**", (route) => {
        route.abort("failed");
      });

      // イベント一覧ページにアクセス
      await page.goto("/events");
      await page.waitForLoadState("networkidle");

      // エラーメッセージまたはローディング状態が適切に表示されることを確認
      const hasErrorMessage = await page.locator('[data-testid="error-message"]').isVisible();
      const hasLoadingIndicator = await page
        .locator('[data-testid="loading-indicator"]')
        .isVisible();
      const hasRetryButton = await page.locator('[data-testid="retry-button"]').isVisible();

      // いずれかのエラーハンドリング要素が表示されていること
      expect(hasErrorMessage || hasLoadingIndicator || hasRetryButton).toBe(true);
    });
  });
});
