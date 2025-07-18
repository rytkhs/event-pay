import { test, expect } from "@playwright/test";

/**
 * 参加申し込みフローE2Eテスト
 * 統合テストから移行した参加申し込み関連のユーザーフロー
 */

test.describe("参加申し込みフロー", () => {
  let eventId: string;
  let inviteLink: string;

  test.beforeAll(async ({ browser }) => {
    // テスト用イベントを作成
    const page = await browser.newPage();

    // イベント作成者としてログイン
    await page.goto("/auth/login");
    await page.fill('[name="email"]', "creator@eventpay.test");
    await page.fill('[name="password"]', "testpassword123");
    await page.click('button[type="submit"]');
    await page.waitForURL("/dashboard");

    // テスト用イベントを作成
    await page.click('[data-testid="create-event-button"]');
    await page.waitForURL("/events/new");

    await page.fill('[name="title"]', "テスト参加申し込みイベント");
    await page.fill('[name="description"]', "参加申し込みフローテスト用のイベントです");
    await page.fill('[name="location"]', "オンライン");
    await page.fill('[name="event_date"]', "2024-12-31");
    await page.fill('[name="event_time"]', "19:00");
    await page.fill('[name="capacity"]', "10");
    await page.fill('[name="participation_fee"]', "1000");

    // 決済方法を選択
    await page.check('[name="payment_methods"][value="stripe"]');
    await page.check('[name="payment_methods"][value="cash"]');

    await page.click('button[type="submit"]');
    await page.waitForURL(/\/events\/[^\/]+$/);

    // イベントIDと招待リンクを取得
    eventId = page.url().split("/").pop()!;
    inviteLink = await page.locator('[data-testid="invite-link"]').inputValue();

    await page.close();
  });

  test.describe("招待リンクからの参加申し込み", () => {
    test("招待リンクから参加申し込みページにアクセスできる", async ({ page }) => {
      await page.goto(inviteLink);

      // イベント詳細が表示されることを確認
      await expect(page.locator('[data-testid="event-title"]')).toContainText(
        "テスト参加申し込みイベント"
      );
      await expect(page.locator('[data-testid="event-description"]')).toContainText(
        "参加申し込みフローテスト用のイベントです"
      );
      await expect(page.locator('[data-testid="event-location"]')).toContainText("オンライン");
      await expect(page.locator('[data-testid="participation-fee"]')).toContainText("1,000円");

      // 参加申し込みフォームが表示されることを確認
      await expect(page.locator('[data-testid="registration-form"]')).toBeVisible();
    });

    test("未認証ユーザーでも参加申し込みができる", async ({ page }) => {
      await page.goto(inviteLink);

      // 参加者情報を入力
      await page.fill('[name="name"]', "テスト参加者");
      await page.fill('[name="email"]', "participant@example.com");
      await page.fill('[name="phone"]', "090-1234-5678");

      // 決済方法を選択
      await page.check('[name="payment_method"][value="stripe"]');

      // 参加申し込みボタンをクリック
      await page.click('[data-testid="register-button"]');

      // Stripe決済ページにリダイレクトされることを確認
      await page.waitForURL(/checkout\.stripe\.com/);
    });

    test("現金決済での参加申し込みができる", async ({ page }) => {
      await page.goto(inviteLink);

      // 参加者情報を入力
      await page.fill('[name="name"]', "現金参加者");
      await page.fill('[name="email"]', "cash-participant@example.com");
      await page.fill('[name="phone"]', "090-5678-1234");

      // 現金決済を選択
      await page.check('[name="payment_method"][value="cash"]');

      // 参加申し込みボタンをクリック
      await page.click('[data-testid="register-button"]');

      // 成功ページにリダイレクトされることを確認
      await page.waitForURL(/\/events\/[^\/]+\/registration\/success/);
      await expect(page.locator('[data-testid="success-message"]')).toContainText(
        "参加申し込みが完了しました"
      );
      await expect(page.locator('[data-testid="payment-method"]')).toContainText("現金");
    });

    test("バリデーションエラーが適切に表示される", async ({ page }) => {
      await page.goto(inviteLink);

      // 空のフォームで送信
      await page.click('[data-testid="register-button"]');

      // バリデーションエラーが表示されることを確認
      await expect(page.locator('[data-testid="name-error"]')).toBeVisible();
      await expect(page.locator('[data-testid="email-error"]')).toBeVisible();
      await expect(page.locator('[data-testid="phone-error"]')).toBeVisible();
      await expect(page.locator('[data-testid="payment-method-error"]')).toBeVisible();

      // 無効なメールアドレスを入力
      await page.fill('[name="email"]', "invalid-email");
      await page.click('[data-testid="register-button"]');

      // メールアドレスのバリデーションエラーを確認
      await expect(page.locator('[data-testid="email-error"]')).toContainText(
        "有効なメールアドレスを入力してください"
      );
    });
  });

  test.describe("参加ステータス管理", () => {
    test.beforeEach(async ({ page }) => {
      // イベント作成者としてログイン
      await page.goto("/auth/login");
      await page.fill('[name="email"]', "creator@eventpay.test");
      await page.fill('[name="password"]', "testpassword123");
      await page.click('button[type="submit"]');
      await page.waitForURL("/dashboard");
    });

    test("参加者一覧で参加ステータスを確認できる", async ({ page }) => {
      await page.goto(`/events/${eventId}/attendees`);

      // 参加者一覧が表示されることを確認
      await expect(page.locator('[data-testid="attendees-list"]')).toBeVisible();

      // 参加者の情報が表示されることを確認
      await expect(page.locator('[data-testid="attendee-name"]').first()).toBeVisible();
      await expect(page.locator('[data-testid="attendee-email"]').first()).toBeVisible();
      await expect(page.locator('[data-testid="payment-status"]').first()).toBeVisible();
    });

    test("参加ステータスを変更できる", async ({ page }) => {
      await page.goto(`/events/${eventId}/attendees`);

      // 最初の参加者のステータス変更メニューを開く
      await page.locator('[data-testid="attendee-menu"]').first().click();

      // ステータス変更オプションが表示されることを確認
      await expect(page.locator('[data-testid="status-pending"]')).toBeVisible();
      await expect(page.locator('[data-testid="status-confirmed"]')).toBeVisible();
      await expect(page.locator('[data-testid="status-cancelled"]')).toBeVisible();

      // ステータスを「確認済み」に変更
      await page.click('[data-testid="status-confirmed"]');

      // 確認ダイアログが表示されることを確認
      await expect(page.locator('[data-testid="confirm-dialog"]')).toBeVisible();
      await page.click('[data-testid="confirm-button"]');

      // ステータスが更新されることを確認
      await expect(page.locator('[data-testid="payment-status"]').first()).toContainText(
        "確認済み"
      );
    });

    test("参加者をキャンセルできる", async ({ page }) => {
      await page.goto(`/events/${eventId}/attendees`);

      // 参加者のキャンセルメニューを開く
      await page.locator('[data-testid="attendee-menu"]').first().click();
      await page.click('[data-testid="status-cancelled"]');

      // キャンセル確認ダイアログが表示されることを確認
      await expect(page.locator('[data-testid="cancel-dialog"]')).toBeVisible();
      await expect(page.locator('[data-testid="cancel-warning"]')).toContainText(
        "この操作は取り消せません"
      );

      // キャンセルを確認
      await page.click('[data-testid="cancel-confirm-button"]');

      // ステータスが「キャンセル済み」に更新されることを確認
      await expect(page.locator('[data-testid="payment-status"]').first()).toContainText(
        "キャンセル済み"
      );
    });
  });

  test.describe("決済フロー", () => {
    test("Stripe決済フローが正常に動作する", async ({ page }) => {
      await page.goto(inviteLink);

      // 参加者情報を入力
      await page.fill('[name="name"]', "Stripe参加者");
      await page.fill('[name="email"]', "stripe-participant@example.com");
      await page.fill('[name="phone"]', "090-9999-8888");

      // Stripe決済を選択
      await page.check('[name="payment_method"][value="stripe"]');

      // 参加申し込みボタンをクリック
      await page.click('[data-testid="register-button"]');

      // Stripe決済ページにリダイレクトされることを確認
      await page.waitForURL(/checkout\.stripe\.com/);

      // Stripe決済フォームが表示されることを確認
      await expect(page.locator('[data-testid="stripe-checkout-form"]')).toBeVisible();
    });

    test("決済成功後の処理が正常に動作する", async ({ page }) => {
      // モックのStripe成功ページを使用
      await page.goto(`/events/${eventId}/registration/success?session_id=mock_session_success`);

      // 成功ページが表示されることを確認
      await expect(page.locator('[data-testid="payment-success"]')).toBeVisible();
      await expect(page.locator('[data-testid="success-message"]')).toContainText(
        "お支払いが完了しました"
      );

      // 参加確認情報が表示されることを確認
      await expect(page.locator('[data-testid="event-details"]')).toBeVisible();
      await expect(page.locator('[data-testid="attendance-qr-code"]')).toBeVisible();
    });

    test("決済失敗時の処理が正常に動作する", async ({ page }) => {
      // モックのStripe失敗ページを使用
      await page.goto(
        `/events/${eventId}/registration/cancelled?session_id=mock_session_cancelled`
      );

      // 失敗ページが表示されることを確認
      await expect(page.locator('[data-testid="payment-cancelled"]')).toBeVisible();
      await expect(page.locator('[data-testid="error-message"]')).toContainText(
        "お支払いがキャンセルされました"
      );

      // 再試行ボタンが表示されることを確認
      await expect(page.locator('[data-testid="retry-button"]')).toBeVisible();
    });
  });

  test.describe("定員管理", () => {
    test("定員に達した場合の処理が正常に動作する", async ({ page }) => {
      // 定員1名のイベントを作成
      await page.goto("/auth/login");
      await page.fill('[name="email"]', "creator@eventpay.test");
      await page.fill('[name="password"]', "testpassword123");
      await page.click('button[type="submit"]');
      await page.waitForURL("/dashboard");

      await page.click('[data-testid="create-event-button"]');
      await page.waitForURL("/events/new");

      await page.fill('[name="title"]', "定員テストイベント");
      await page.fill('[name="description"]', "定員テスト用");
      await page.fill('[name="location"]', "オンライン");
      await page.fill('[name="event_date"]', "2024-12-31");
      await page.fill('[name="event_time"]', "20:00");
      await page.fill('[name="capacity"]', "1");
      await page.fill('[name="participation_fee"]', "500");

      await page.check('[name="payment_methods"][value="cash"]');
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/events\/[^\/]+$/);

      const capacityEventId = page.url().split("/").pop()!;
      const capacityInviteLink = await page.locator('[data-testid="invite-link"]').inputValue();

      // 1人目の参加申し込み
      await page.goto(capacityInviteLink);
      await page.fill('[name="name"]', "1人目参加者");
      await page.fill('[name="email"]', "first@example.com");
      await page.fill('[name="phone"]', "090-1111-1111");
      await page.check('[name="payment_method"][value="cash"]');
      await page.click('[data-testid="register-button"]');
      await page.waitForURL(/\/events\/[^\/]+\/registration\/success/);

      // 2人目の参加申し込み（定員オーバー）
      await page.goto(capacityInviteLink);

      // 定員に達したメッセージが表示されることを確認
      await expect(page.locator('[data-testid="capacity-full-message"]')).toBeVisible();
      await expect(page.locator('[data-testid="capacity-full-message"]')).toContainText(
        "定員に達しました"
      );

      // 参加申し込みフォームが無効化されることを確認
      await expect(page.locator('[data-testid="registration-form"]')).toHaveAttribute("disabled");
    });

    test("キャンセル待ち機能が正常に動作する", async ({ page }) => {
      // 定員に達したイベントでキャンセル待ち申し込み
      const capacityInviteLink = await page.locator('[data-testid="invite-link"]').inputValue();
      await page.goto(capacityInviteLink);

      // キャンセル待ち申し込みボタンが表示されることを確認
      await expect(page.locator('[data-testid="waitlist-button"]')).toBeVisible();

      // キャンセル待ち申し込み
      await page.fill('[name="name"]', "キャンセル待ち参加者");
      await page.fill('[name="email"]', "waitlist@example.com");
      await page.fill('[name="phone"]', "090-2222-2222");
      await page.click('[data-testid="waitlist-button"]');

      // キャンセル待ち完了メッセージが表示されることを確認
      await expect(page.locator('[data-testid="waitlist-success"]')).toBeVisible();
      await expect(page.locator('[data-testid="waitlist-success"]')).toContainText(
        "キャンセル待ちに登録しました"
      );
    });
  });

  test.describe("QRコード機能", () => {
    test("参加確認QRコードが正常に表示される", async ({ page }) => {
      await page.goto(`/events/${eventId}/registration/success?session_id=mock_session_success`);

      // QRコードが表示されることを確認
      await expect(page.locator('[data-testid="attendance-qr-code"]')).toBeVisible();

      // QRコードの詳細情報が表示されることを確認
      await expect(page.locator('[data-testid="qr-code-info"]')).toContainText(
        "受付時にこのQRコードを提示してください"
      );
    });

    test("QRコードスキャン機能が正常に動作する", async ({ page }) => {
      // イベント作成者としてログイン
      await page.goto("/auth/login");
      await page.fill('[name="email"]', "creator@eventpay.test");
      await page.fill('[name="password"]', "testpassword123");
      await page.click('button[type="submit"]');
      await page.waitForURL("/dashboard");

      // QRコードスキャンページに移動
      await page.goto(`/events/${eventId}/checkin`);

      // QRコードスキャナーが表示されることを確認
      await expect(page.locator('[data-testid="qr-scanner"]')).toBeVisible();

      // カメラ権限要求ダイアログが表示されることを確認
      await expect(page.locator('[data-testid="camera-permission"]')).toBeVisible();
    });
  });
});
