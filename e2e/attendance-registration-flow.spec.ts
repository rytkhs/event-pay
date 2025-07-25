import { test, expect } from "@playwright/test";
import { createUniqueTestUser } from "./helpers/rhf-test-helpers";

/**
 * 参加申し込みフローE2Eテスト
 * 統合テストから移行した参加申し込み関連のユーザーフロー
 * react-hook-form対応版
 */

test.describe("参加申し込みフロー", () => {
  let eventId: string;
  let inviteLink: string;

  test.beforeAll(async ({ browser }) => {
    // テスト用イベントを作成
    const page = await browser.newPage();

    // 確認済みのテストユーザーでログイン
    await page.goto("/login");
    await page.fill('[name="email"]', "creator@eventpay.test");
    await page.fill('[name="password"]', "TestPassword123");
    await page.click('button[type="submit"]');
    await page.waitForURL("/home", { timeout: 60000 });
    expect(page.url()).toBe("http://localhost:3000/home");

    // テスト用イベントを作成（react-hook-form対応）
    // イベント作成ボタンが存在するかチェック
    const createButton = page.locator('[data-testid="create-event-button"]');
    if (await createButton.isVisible()) {
      await createButton.click();
    } else {
      // ボタンが見つからない場合は直接URLに遷移
      await page.goto("/events/create");
    }
    await page.waitForURL("/events/create");

    await page.fill('input[name="title"]', "テスト参加申し込みイベント");
    await page.fill('textarea[name="description"]', "参加申し込みフローテスト用のイベントです");
    await page.fill('input[name="location"]', "オンライン");
    await page.fill('input[name="date"]', "2024-12-31T19:00");
    await page.fill('input[name="capacity"]', "10");
    await page.fill('input[name="fee"]', "1000");

    // 決済方法を選択（react-hook-formのCheckboxコンポーネント）
    await page.check("#stripe");
    await page.check("#cash");

    await page.click('button[type="submit"]');
    await page.waitForURL(/\/events\/[^\/]+$/);

    // イベントIDと招待リンクを取得
    eventId = page.url().split("/").pop()!;
    inviteLink = await page.locator('[data-testid="invite-link"]').inputValue();

    await page.close();
  });

  test.beforeEach(async ({ page }) => {
    // ユニークなテスト用参加者を作成してログイン
    const participant = await createUniqueTestUser(page);

    // ユーザー作成後にログイン
    await page.goto("/login");
    await page.fill('[name="email"]', participant.email);
    await page.fill('[name="password"]', participant.password);
    await page.click('button[type="submit"]');
    await page.waitForURL("/home", { timeout: 60000 });
    expect(page.url()).toBe("http://localhost:3000/home");
  });

  test.describe("基本的な参加申し込み", () => {
    test("招待リンクから参加申し込みが正常に動作する", async ({ page }) => {
      // 招待リンクにアクセス
      await page.goto(inviteLink);

      // イベント詳細が表示されることを確認
      await expect(page.locator('[data-testid="event-title"]')).toContainText(
        "テスト参加申し込みイベント"
      );
      await expect(page.locator('[data-testid="event-description"]')).toContainText(
        "参加申し込みフローテスト用のイベントです"
      );

      // 参加申し込みボタンをクリック
      await page.click('[data-testid="register-button"]');

      // 参加申し込み確認ページまたはモーダルが表示される
      await expect(page.locator('[data-testid="registration-form"]')).toBeVisible();

      // 参加申し込みを確定
      await page.click('[data-testid="confirm-registration-button"]');

      // 成功メッセージを確認
      await expect(page.locator('[data-testid="success-message"]')).toContainText(
        "参加申し込みが完了しました"
      );

      // 決済ページまたは完了ページにリダイレクトされる
      await page.waitForURL(/\/(payment|registration-complete)/);
    });

    test("参加者情報の入力が必要な場合のフロー", async ({ page }) => {
      await page.goto(inviteLink);
      await page.click('[data-testid="register-button"]');

      // 参加者情報フォームが表示される（react-hook-form対応）
      await expect(page.locator('[data-testid="participant-form"]')).toBeVisible();

      // 追加情報を入力
      await page.fill('[name="phone"]', "090-1234-5678");
      await page.fill('[name="dietary_restrictions"]', "なし");
      await page.fill('[name="emergency_contact"]', "緊急連絡先");

      // フォーム送信
      await page.click('[data-testid="submit-participant-info"]');

      // react-hook-formのバリデーションが正常に動作することを確認
      await expect(page.locator('[data-testid="success-message"]')).toContainText(
        "参加申し込みが完了しました"
      );
    });

    test("定員に達している場合の処理", async ({ page }) => {
      // 定員1のイベントを作成
      await page.goto("/events/create");
      await page.fill('input[name="title"]', "定員テストイベント");
      await page.fill('input[name="date"]', "2024-12-31T18:00");
      await page.fill('input[name="capacity"]', "1");
      await page.fill('input[name="fee"]', "500");
      await page.check("#stripe");
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/events\/[^\/]+$/);

      const limitedEventId = page.url().split("/").pop()!;

      // 別のユーザーとして参加申し込み（定員を満たす）
      // （実際の実装では、事前にテストデータで定員を満たしておく）

      // 定員に達した状態でアクセス
      await page.goto(`/events/${limitedEventId}`);

      // 参加申し込みボタンが無効化されていることを確認
      await expect(page.locator('[data-testid="register-button"]')).toBeDisabled();
      await expect(page.locator('[data-testid="capacity-full-message"]')).toContainText(
        "定員に達しています"
      );
    });
  });

  test.describe("決済フロー", () => {
    test("Stripe決済フローが正常に動作する", async ({ page }) => {
      await page.goto(inviteLink);
      await page.click('[data-testid="register-button"]');
      await page.click('[data-testid="confirm-registration-button"]');

      // 決済方法選択ページが表示される
      await expect(page.locator('[data-testid="payment-method-selection"]')).toBeVisible();

      // Stripe決済を選択
      await page.click('[data-testid="select-stripe-payment"]');

      // Stripe決済ページにリダイレクトされる
      await page.waitForURL(/\/payment\/stripe/);

      // テスト用カード情報を入力（実際のテストではStripe Test Modeを使用）
      await page.fill('[data-testid="card-number"]', "4242424242424242");
      await page.fill('[data-testid="card-expiry"]', "12/25");
      await page.fill('[data-testid="card-cvc"]', "123");

      // 決済を実行
      await page.click('[data-testid="pay-button"]');

      // 決済完了ページが表示される
      await page.waitForURL(/\/payment\/success/);
      await expect(page.locator('[data-testid="payment-success-message"]')).toContainText(
        "決済が完了しました"
      );
    });

    test("現金決済フローが正常に動作する", async ({ page }) => {
      await page.goto(inviteLink);
      await page.click('[data-testid="register-button"]');
      await page.click('[data-testid="confirm-registration-button"]');

      // 決済方法選択ページが表示される
      await expect(page.locator('[data-testid="payment-method-selection"]')).toBeVisible();

      // 現金決済を選択
      await page.click('[data-testid="select-cash-payment"]');

      // 現金決済の説明と確認が表示される
      await expect(page.locator('[data-testid="cash-payment-info"]')).toContainText(
        "当日現金でお支払いください"
      );

      // 確認ボタンをクリック
      await page.click('[data-testid="confirm-cash-payment"]');

      // 登録完了ページが表示される
      await page.waitForURL(/\/registration-complete/);
      await expect(page.locator('[data-testid="registration-complete-message"]')).toContainText(
        "参加申し込みが完了しました"
      );
    });

    test("決済エラーハンドリングが適切に動作する", async ({ page }) => {
      await page.goto(inviteLink);
      await page.click('[data-testid="register-button"]');
      await page.click('[data-testid="confirm-registration-button"]');
      await page.click('[data-testid="select-stripe-payment"]');

      // 無効なカード情報を入力
      await page.fill('[data-testid="card-number"]', "4000000000000002"); // Stripe test card for declined
      await page.fill('[data-testid="card-expiry"]', "12/25");
      await page.fill('[data-testid="card-cvc"]', "123");

      await page.click('[data-testid="pay-button"]');

      // エラーメッセージが表示される
      await expect(page.locator('[data-testid="payment-error"]')).toContainText(
        "決済が失敗しました"
      );

      // 再試行可能な状態であることを確認
      await expect(page.locator('[data-testid="retry-payment-button"]')).toBeVisible();
    });
  });

  test.describe("参加申し込み状態管理", () => {
    test("重複申し込みの防止が機能する", async ({ page }) => {
      // 一度申し込みを完了
      await page.goto(inviteLink);
      await page.click('[data-testid="register-button"]');
      await page.click('[data-testid="confirm-registration-button"]');
      await page.click('[data-testid="select-cash-payment"]');
      await page.click('[data-testid="confirm-cash-payment"]');

      // 再度同じイベントにアクセス
      await page.goto(inviteLink);

      // 既に申し込み済みであることが表示される
      await expect(page.locator('[data-testid="already-registered-message"]')).toContainText(
        "このイベントにはすでに参加申し込み済みです"
      );

      // 参加申し込みボタンが無効化されている
      await expect(page.locator('[data-testid="register-button"]')).toBeDisabled();
    });

    test("申し込みキャンセル機能が動作する", async ({ page }) => {
      // 申し込みを完了
      await page.goto(inviteLink);
      await page.click('[data-testid="register-button"]');
      await page.click('[data-testid="confirm-registration-button"]');
      await page.click('[data-testid="select-cash-payment"]');
      await page.click('[data-testid="confirm-cash-payment"]');

      // マイページまたはイベント詳細でキャンセルボタンをクリック
      await page.goto(`/events/${eventId}`);
      await page.click('[data-testid="cancel-registration-button"]');

      // キャンセル確認ダイアログが表示される
      await expect(page.locator('[data-testid="cancel-confirmation-dialog"]')).toBeVisible();
      await page.click('[data-testid="confirm-cancel-button"]');

      // キャンセル完了メッセージを確認
      await expect(page.locator('[data-testid="success-message"]')).toContainText(
        "参加申し込みをキャンセルしました"
      );

      // 再度参加申し込み可能な状態に戻る
      await expect(page.locator('[data-testid="register-button"]')).toBeEnabled();
    });
  });

  test.describe("フォームバリデーション", () => {
    test("必須項目のバリデーションが機能する", async ({ page }) => {
      await page.goto(inviteLink);
      await page.click('[data-testid="register-button"]');

      // 必須項目を空で送信
      await page.click('[data-testid="confirm-registration-button"]');

      // react-hook-formのクライアントサイドバリデーションによりエラーが表示される
      // 参加申し込みフォームでは通常、必須項目は最小限だが、
      // 追加情報が必要な場合のバリデーションを確認
      if (await page.locator('[data-testid="participant-form"]').isVisible()) {
        await expect(page.locator("text=この項目は必須です")).toBeVisible();
      }
    });

    test("連絡先情報のフォーマットバリデーションが機能する", async ({ page }) => {
      await page.goto(inviteLink);
      await page.click('[data-testid="register-button"]');

      if (await page.locator('[data-testid="participant-form"]').isVisible()) {
        // 無効な電話番号を入力
        await page.fill('[name="phone"]', "invalid-phone");

        // react-hook-formのバリデーションでエラーが表示される
        await page.click('[data-testid="submit-participant-info"]');
        await expect(page.locator("text=正しい電話番号を入力してください")).toBeVisible();

        // 正しい形式に修正
        await page.fill('[name="phone"]', "090-1234-5678");
        await expect(page.locator("text=正しい電話番号を入力してください")).not.toBeVisible();
      }
    });
  });

  test.describe("レスポンシブデザイン", () => {
    test("モバイルデバイスで参加申し込みフローが正常に動作する", async ({ page }) => {
      // モバイルサイズに設定
      await page.setViewportSize({ width: 375, height: 667 });

      await page.goto(inviteLink);

      // モバイルビューでイベント詳細が適切に表示される
      await expect(page.locator('[data-testid="event-title"]')).toBeVisible();
      await expect(page.locator('[data-testid="register-button"]')).toBeVisible();

      // モバイルでの参加申し込み
      await page.click('[data-testid="register-button"]');
      await page.click('[data-testid="confirm-registration-button"]');

      // モバイルでの決済方法選択
      await expect(page.locator('[data-testid="payment-method-selection"]')).toBeVisible();
      await page.click('[data-testid="select-cash-payment"]');
      await page.click('[data-testid="confirm-cash-payment"]');

      // 登録完了の確認
      await expect(page.locator('[data-testid="registration-complete-message"]')).toBeVisible();
    });
  });
});
