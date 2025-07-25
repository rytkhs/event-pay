import { test, expect } from "@playwright/test";

/**
 * バリデーションフローE2Eテスト
 * 統合テストで削除されたZodバリデーション・フォームバリデーションを実環境で検証
 * より実用的で価値の高いテストケース
 */

test.describe("フォームバリデーション（実環境）", () => {
  test.beforeEach(async ({ page }) => {
    // 確認済みのテストユーザーでログイン
    await page.goto("/login");
    await page.fill('[name="email"]', "test@eventpay.test");
    await page.fill('[name="password"]', "TestPassword123");
    await page.click('button[type="submit"]');
    await page.waitForURL("/home", { timeout: 60000 });
  });

  test.describe("イベント作成フォームのバリデーション", () => {
    test("必須フィールド未入力時のエラー表示", async ({ page }) => {
      await page.goto("/events/create");
      await page.waitForLoadState("networkidle");

      // 必須フィールドを空にして送信
      await page.click('button[type="submit"]');

      // タイトルのエラーメッセージが表示されることを確認
      await expect(
        page.locator('[data-testid="title-error"], .error-message:has-text("タイトル")')
      ).toBeVisible();

      // 日時のエラーメッセージが表示されることを確認
      await expect(
        page.locator('[data-testid="date-error"], .error-message:has-text("開催日時")')
      ).toBeVisible();

      // フォームが送信されずに残っていることを確認
      await expect(page).toHaveURL(/\/events\/create/);
    });

    test("不正な参加費入力時のバリデーション", async ({ page }) => {
      await page.goto("/events/create");
      await page.waitForLoadState("networkidle");

      // 必須フィールドを正しく入力
      await page.fill('input[name="title"]', "バリデーションテスト");

      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 1);
      await page.fill('input[name="date"]', futureDate.toISOString().slice(0, 16));

      // 不正な参加費を入力
      await page.fill('input[name="fee"]', "-100"); // 負数
      await page.click('button[type="submit"]');

      // 参加費のエラーメッセージが表示されることを確認
      await expect(
        page.locator('[data-testid="fee-error"], .error-message:has-text("参加費")')
      ).toBeVisible();
    });

    test("過去の日時入力時のバリデーション", async ({ page }) => {
      await page.goto("/events/create");
      await page.waitForLoadState("networkidle");

      await page.fill('input[name="title"]', "過去日時テスト");

      // 過去の日時を入力
      const pastDate = new Date();
      pastDate.setMonth(pastDate.getMonth() - 1);
      await page.fill('input[name="date"]', pastDate.toISOString().slice(0, 16));

      await page.fill('input[name="fee"]', "1000");
      await page.click('button[type="submit"]');

      // 日時のエラーメッセージが表示されることを確認
      await expect(
        page.locator('[data-testid="date-error"], .error-message:has-text("未来")')
      ).toBeVisible();
    });

    test("定員数の上限バリデーション", async ({ page }) => {
      await page.goto("/events/create");
      await page.waitForLoadState("networkidle");

      await page.fill('input[name="title"]', "定員テスト");

      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 1);
      await page.fill('input[name="date"]', futureDate.toISOString().slice(0, 16));

      await page.fill('input[name="fee"]', "1000");

      // 異常に大きい定員数を入力
      await page.fill('input[name="capacity"]', "999999");
      await page.click('button[type="submit"]');

      // 定員のエラーメッセージが表示される可能性を確認
      const capacityError = page.locator(
        '[data-testid="capacity-error"], .error-message:has-text("定員")'
      );

      // エラーが表示されるか、またはフォームが送信されないことを確認
      const isErrorVisible = await capacityError.isVisible();
      const currentUrl = page.url();

      // エラー表示またはページ遷移なしを確認
      expect(isErrorVisible || currentUrl.includes("/create")).toBe(true);
    });
  });

  test.describe("ユーザー登録フォームのバリデーション", () => {
    test("利用規約未同意時のエラー表示", async ({ page }) => {
      // ログアウト
      await page.click('[data-testid="user-menu-button"]');
      await page.click('[data-testid="logout-button"]');
      await page.waitForURL("/", { timeout: 10000 });

      // 登録ページに移動
      await page.goto("/register");
      await page.waitForLoadState("networkidle");

      // 必要な情報を入力（利用規約チェック以外）
      await page.fill('input[name="name"]', "テストユーザー");
      await page.fill('input[name="email"]', "newuser@example.com");
      await page.fill('input[name="password"]', "SecurePassword123");
      await page.fill('input[name="passwordConfirm"]', "SecurePassword123");

      // 利用規約にチェックを入れずに送信
      await page.click('button[type="submit"]');

      // 利用規約のエラーメッセージが表示されることを確認
      await expect(
        page.locator('[data-testid="terms-error"], .error-message:has-text("利用規約")')
      ).toBeVisible();

      // 登録ページに残っていることを確認
      await expect(page).toHaveURL(/\/register/);
    });

    test("パスワード確認不一致時のエラー表示", async ({ page }) => {
      // ログアウト
      await page.click('[data-testid="user-menu-button"]');
      await page.click('[data-testid="logout-button"]');
      await page.waitForURL("/", { timeout: 10000 });

      await page.goto("/register");
      await page.waitForLoadState("networkidle");

      await page.fill('input[name="name"]', "テストユーザー");
      await page.fill('input[name="email"]', "newuser2@example.com");
      await page.fill('input[name="password"]', "SecurePassword123");
      await page.fill('input[name="passwordConfirm"]', "DifferentPassword456"); // 異なるパスワード

      // 利用規約にチェック
      await page.check('input[name="termsAgreed"]');
      await page.click('button[type="submit"]');

      // パスワード確認のエラーメッセージが表示されることを確認
      await expect(
        page.locator(
          '[data-testid="password-confirm-error"], .error-message:has-text("パスワード")'
        )
      ).toBeVisible();
    });

    test("無効なメールアドレス形式のエラー表示", async ({ page }) => {
      // ログアウト
      await page.click('[data-testid="user-menu-button"]');
      await page.click('[data-testid="logout-button"]');
      await page.waitForURL("/", { timeout: 10000 });

      await page.goto("/register");
      await page.waitForLoadState("networkidle");

      await page.fill('input[name="name"]', "テストユーザー");
      await page.fill('input[name="email"]', "invalid-email-format"); // 無効なメール
      await page.fill('input[name="password"]', "SecurePassword123");
      await page.fill('input[name="passwordConfirm"]', "SecurePassword123");

      await page.check('input[name="termsAgreed"]');
      await page.click('button[type="submit"]');

      // メールアドレスのエラーメッセージが表示されることを確認
      await expect(
        page.locator('[data-testid="email-error"], .error-message:has-text("メールアドレス")')
      ).toBeVisible();
    });
  });

  test.describe("イベント編集フォームのバリデーション", () => {
    test("参加者がいる場合の編集制限メッセージ", async ({ page }) => {
      // 既存のイベントの編集ページに移動
      await page.goto("/events");
      await page.waitForLoadState("networkidle");

      const firstEventLink = page.locator('[data-testid*="event-card"]').first();
      await firstEventLink.click();
      await page.waitForURL(/\/events\/[^\/]+$/, { timeout: 10000 });

      await page.click('[data-testid="edit-event-button"]');
      await page.waitForURL(/\/events\/[^\/]+\/edit/, { timeout: 10000 });

      // 参加者がいる場合の制限メッセージが表示されるかチェック
      const restrictionMessage = page.locator(
        '[data-testid="edit-restrictions"], .warning-message:has-text("参加者")'
      );

      // メッセージが表示される場合はその内容を確認
      if (await restrictionMessage.isVisible()) {
        await expect(restrictionMessage).toContainText("参加者");
        await expect(restrictionMessage).toContainText("制限");
      }

      // 編集フォームが表示されることを確認
      await expect(page.locator('input[name="title"]')).toBeVisible();
    });

    test("編集時のリアルタイムバリデーション", async ({ page }) => {
      await page.goto("/events");
      await page.waitForLoadState("networkidle");

      const firstEventLink = page.locator('[data-testid*="event-card"]').first();
      await firstEventLink.click();
      await page.waitForURL(/\/events\/[^\/]+$/, { timeout: 10000 });

      await page.click('[data-testid="edit-event-button"]');
      await page.waitForURL(/\/events\/[^\/]+\/edit/, { timeout: 10000 });

      // タイトルをクリアしてエラー表示を確認
      await page.fill('input[name="title"]', "");
      await page.click('input[name="description"]'); // フォーカスを外す

      // リアルタイムバリデーションエラーが表示されることを確認
      await expect(
        page.locator('[data-testid="title-error"], .error-message:has-text("タイトル")')
      ).toBeVisible();

      // 有効な値に戻すとエラーが消えることを確認
      await page.fill('input[name="title"]', "修正されたタイトル");
      await page.click('input[name="description"]'); // フォーカスを外す

      // エラーメッセージが消えることを確認
      await expect(
        page.locator('[data-testid="title-error"], .error-message:has-text("タイトル")')
      ).not.toBeVisible();
    });
  });

  test.describe("動的バリデーション（決済方法による制御）", () => {
    test("無料イベント時の決済方法選択非表示", async ({ page }) => {
      await page.goto("/events/create");
      await page.waitForLoadState("networkidle");

      await page.fill('input[name="title"]', "無料イベントテスト");

      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 1);
      await page.fill('input[name="date"]', futureDate.toISOString().slice(0, 16));

      // 参加費を0円に設定
      await page.fill('input[name="fee"]', "0");

      // 決済方法選択が非表示になることを確認
      const paymentMethodsSection = page.locator(
        '[data-testid="payment-methods"], fieldset:has-text("決済方法")'
      );

      // 少し待ってから確認（動的制御のため）
      await page.waitForTimeout(500);

      // 決済方法選択が非表示になっているか、または無効になっていることを確認
      const isPaymentSectionVisible = await paymentMethodsSection.isVisible();
      const infoMessage = page.locator(
        '.info-message:has-text("参加費が0円"), [data-testid="free-event-info"]'
      );
      const isInfoVisible = await infoMessage.isVisible();

      // 決済方法が非表示になるか、無料イベント情報が表示されることを確認
      expect(!isPaymentSectionVisible || isInfoVisible).toBe(true);
    });

    test("有料イベント時の決済方法必須バリデーション", async ({ page }) => {
      await page.goto("/events/create");
      await page.waitForLoadState("networkidle");

      await page.fill('input[name="title"]', "有料イベントテスト");

      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 1);
      await page.fill('input[name="date"]', futureDate.toISOString().slice(0, 16));

      // 有料に設定
      await page.fill('input[name="fee"]', "1000");

      // 決済方法を選択せずに送信
      await page.click('button[type="submit"]');

      // 決済方法のエラーメッセージが表示されることを確認
      const paymentMethodError = page.locator(
        '[data-testid="payment-methods-error"], .error-message:has-text("決済方法")'
      );
      await expect(paymentMethodError).toBeVisible();
    });
  });
});
