import { test, expect } from "@playwright/test";

/**
 * イベント管理フローE2Eテスト
 * 統合テストから移行した主要なユーザーフロー
 */

test.describe("イベント管理フロー", () => {
  test.beforeEach(async ({ page }) => {
    // テスト用ユーザーでログイン
    await page.goto("/auth/login");
    await page.fill('[name="email"]', "test@eventpay.test");
    await page.fill('[name="password"]', "testpassword123");
    await page.click('button[type="submit"]');
    await page.waitForURL("/dashboard");
  });

  test.describe("イベント作成フロー", () => {
    test("完全なイベント作成フローが正常に動作する", async ({ page }) => {
      // ダッシュボードからイベント作成ページに遷移
      await page.click('[data-testid="create-event-button"]');
      await page.waitForURL("/events/new");

      // イベント基本情報を入力
      await page.fill('[name="title"]', "テストイベント");
      await page.fill('[name="description"]', "これはテスト用のイベントです");
      await page.fill('[name="location"]', "東京都渋谷区");
      await page.fill('[name="event_date"]', "2024-12-31");
      await page.fill('[name="event_time"]', "18:00");
      await page.fill('[name="participation_fee"]', "1000");
      await page.fill('[name="capacity"]', "50");

      // 決済方法を選択
      await page.check('[name="payment_methods"][value="stripe"]');
      await page.check('[name="payment_methods"][value="cash"]');

      // 締切日時を設定
      await page.fill('[name="registration_deadline"]', "2024-12-30T23:59");
      await page.fill('[name="payment_deadline"]', "2024-12-30T23:59");

      // フォームを送信
      await page.click('button[type="submit"]');

      // 成功メッセージを確認
      await expect(page.locator('[data-testid="success-message"]')).toContainText(
        "イベントが作成されました"
      );

      // イベント詳細ページに遷移することを確認
      await page.waitForURL(/\/events\/[a-f0-9-]+$/);
      await expect(page.locator("h1")).toContainText("テストイベント");

      // 作成されたイベントの詳細情報を確認
      await expect(page.locator('[data-testid="event-description"]')).toContainText(
        "これはテスト用のイベントです"
      );
      await expect(page.locator('[data-testid="event-location"]')).toContainText("東京都渋谷区");
      await expect(page.locator('[data-testid="participation-fee"]')).toContainText("1,000円");
      await expect(page.locator('[data-testid="capacity"]')).toContainText("50名");

      // 招待リンクが生成されることを確認
      await expect(page.locator('[data-testid="invite-link"]')).toBeVisible();
      await expect(page.locator('[data-testid="qr-code"]')).toBeVisible();
    });

    test("バリデーションエラーが適切に表示される", async ({ page }) => {
      await page.click('[data-testid="create-event-button"]');
      await page.waitForURL("/events/new");

      // 空のフォームで送信
      await page.click('button[type="submit"]');

      // バリデーションエラーが表示されることを確認
      await expect(page.locator('[data-testid="title-error"]')).toBeVisible();
      await expect(page.locator('[data-testid="description-error"]')).toBeVisible();
      await expect(page.locator('[data-testid="location-error"]')).toBeVisible();
      await expect(page.locator('[data-testid="event-date-error"]')).toBeVisible();
      await expect(page.locator('[data-testid="capacity-error"]')).toBeVisible();

      // 無効な値を入力
      await page.fill('[name="title"]', ""); // 空のタイトル
      await page.fill('[name="participation_fee"]', "-100"); // 負の値
      await page.fill('[name="capacity"]', "0"); // 0名
      await page.fill('[name="event_date"]', "2020-01-01"); // 過去の日付

      await page.click('button[type="submit"]');

      // 具体的なエラーメッセージを確認
      await expect(page.locator('[data-testid="title-error"]')).toContainText("タイトルは必須です");
      await expect(page.locator('[data-testid="fee-error"]')).toContainText(
        "参加費は0以上の値を入力してください"
      );
      await expect(page.locator('[data-testid="capacity-error"]')).toContainText(
        "定員は1名以上を設定してください"
      );
      await expect(page.locator('[data-testid="event-date-error"]')).toContainText(
        "開催日は現在より未来の日付を選択してください"
      );
    });

    test("無料イベントの作成が正常に動作する", async ({ page }) => {
      await page.click('[data-testid="create-event-button"]');
      await page.waitForURL("/events/new");

      // 無料イベントの情報を入力
      await page.fill('[name="title"]', "無料テストイベント");
      await page.fill('[name="description"]', "これは無料のテストイベントです");
      await page.fill('[name="location"]', "オンライン");
      await page.fill('[name="event_date"]', "2024-12-31");
      await page.fill('[name="event_time"]', "19:00");
      await page.fill('[name="participation_fee"]', "0");
      await page.fill('[name="capacity"]', "100");

      // 決済方法として「無料」を選択
      await page.check('[name="payment_methods"][value="free"]');

      await page.click('button[type="submit"]');

      // 成功メッセージを確認
      await expect(page.locator('[data-testid="success-message"]')).toContainText(
        "イベントが作成されました"
      );

      // イベント詳細ページで無料表示を確認
      await page.waitForURL(/\/events\/[a-f0-9-]+$/);
      await expect(page.locator('[data-testid="participation-fee"]')).toContainText("無料");
      await expect(page.locator('[data-testid="payment-methods"]')).toContainText("無料");
    });

    test("イベント作成時のバリデーションエラーが適切に表示される", async ({ page }) => {
      await page.goto("/events/new");

      // 必須項目を空で送信
      await page.click('button[type="submit"]');

      // エラーメッセージが表示されることを確認
      await expect(page.locator('[data-testid="error-title"]')).toContainText("タイトルは必須です");
      await expect(page.locator('[data-testid="error-date"]')).toContainText("開催日時は必須です");
      await expect(page.locator('[data-testid="error-fee"]')).toContainText("参加費は必須です");
    });
  });

  test.describe("イベント編集フロー", () => {
    let eventId: string;

    test.beforeEach(async ({ page }) => {
      // テスト用イベントを作成
      await page.click('[data-testid="create-event-button"]');
      await page.waitForURL("/events/new");

      await page.fill('[name="title"]', "編集テストイベント");
      await page.fill('[name="description"]', "編集前の説明");
      await page.fill('[name="location"]', "編集前の場所");
      await page.fill('[name="event_date"]', "2024-12-31");
      await page.fill('[name="event_time"]', "18:00");
      await page.fill('[name="participation_fee"]', "1000");
      await page.fill('[name="capacity"]', "30");

      await page.check('[name="payment_methods"][value="stripe"]');
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/events\/[a-f0-9-]+$/);
      eventId = page.url().split("/").pop()!;
    });

    test("イベント編集フローが正常に動作する", async ({ page }) => {
      // 編集ページに遷移
      await page.click('[data-testid="edit-event-button"]');
      await page.waitForURL(`/events/${eventId}/edit`);

      // 既存の値が表示されることを確認
      await expect(page.locator('[name="title"]')).toHaveValue("編集テストイベント");
      await expect(page.locator('[name="description"]')).toHaveValue("編集前の説明");
      await expect(page.locator('[name="location"]')).toHaveValue("編集前の場所");

      // 値を編集
      await page.fill('[name="title"]', "編集後テストイベント");
      await page.fill('[name="description"]', "編集後の説明");
      await page.fill('[name="location"]', "編集後の場所");
      await page.fill('[name="participation_fee"]', "1500");
      await page.fill('[name="capacity"]', "50");

      // 決済方法を変更
      await page.check('[name="payment_methods"][value="cash"]');

      // 変更を保存
      await page.click('button[type="submit"]');

      // 成功メッセージを確認
      await expect(page.locator('[data-testid="success-message"]')).toContainText(
        "イベントが更新されました"
      );

      // イベント詳細ページで変更が反映されることを確認
      await page.waitForURL(`/events/${eventId}`);
      await expect(page.locator("h1")).toContainText("編集後テストイベント");
      await expect(page.locator('[data-testid="event-description"]')).toContainText("編集後の説明");
      await expect(page.locator('[data-testid="event-location"]')).toContainText("編集後の場所");
      await expect(page.locator('[data-testid="participation-fee"]')).toContainText("1,500円");
      await expect(page.locator('[data-testid="capacity"]')).toContainText("50名");
    });

    test("参加者がいる場合の編集制限が適切に動作する", async ({ page }) => {
      // 参加者を追加（モック）
      await page.goto(`/events/${eventId}/attendees`);
      await page.click('[data-testid="add-test-attendee"]'); // テスト用の参加者追加

      // 編集ページに遷移
      await page.click('[data-testid="edit-event-button"]');
      await page.waitForURL(`/events/${eventId}/edit`);

      // 参加費フィールドが無効化されることを確認
      await expect(page.locator('[name="participation_fee"]')).toBeDisabled();
      await expect(page.locator('[data-testid="fee-warning"]')).toContainText(
        "参加者がいるため参加費は変更できません"
      );

      // 定員の減少が制限されることを確認
      await page.fill('[name="capacity"]', "5");
      await page.click('button[type="submit"]');

      await expect(page.locator('[data-testid="capacity-error"]')).toContainText(
        "現在の参加者数を下回る定員は設定できません"
      );
    });

    test("変更確認ダイアログが適切に表示される", async ({ page }) => {
      await page.click('[data-testid="edit-event-button"]');
      await page.waitForURL(`/events/${eventId}/edit`);

      // 重要な変更を行う
      await page.fill('[name="event_date"]', "2025-01-15");
      await page.fill('[name="event_time"]', "20:00");
      await page.fill('[name="location"]', "完全に異なる場所");

      // 保存ボタンをクリック
      await page.click('button[type="submit"]');

      // 変更確認ダイアログが表示されることを確認
      await expect(page.locator('[data-testid="change-confirmation-dialog"]')).toBeVisible();
      await expect(page.locator('[data-testid="change-summary"]')).toContainText("開催日時");
      await expect(page.locator('[data-testid="change-summary"]')).toContainText("開催場所");

      // 参加者への通知オプションを確認
      await expect(page.locator('[data-testid="notify-participants"]')).toBeVisible();
      await page.check('[data-testid="notify-participants"]');

      // 変更を確定
      await page.click('[data-testid="confirm-changes"]');

      // 成功メッセージを確認
      await expect(page.locator('[data-testid="success-message"]')).toContainText(
        "イベントが更新され、参加者に通知されました"
      );
    });
    test("参加者がいない場合、全項目が編集可能", async ({ page }) => {
      // 既存のイベントを作成（前提条件）
      await page.goto("/events/new");
      await page.fill('[name="title"]', "編集テストイベント");
      await page.fill('[name="date"]', "2024-12-31T18:00");
      await page.fill('[name="fee"]', "1000");
      await page.check('[name="payment_methods"][value="stripe"]');
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/events\/[a-f0-9-]+$/);

      // 編集ページに遷移
      await page.click('[data-testid="edit-event-button"]');
      await page.waitForURL(/\/events\/[a-f0-9-]+\/edit$/);

      // 全フィールドが編集可能であることを確認
      await expect(page.locator('[name="title"]')).not.toBeDisabled();
      await expect(page.locator('[name="fee"]')).not.toBeDisabled();
      await expect(page.locator('[name="payment_methods"][value="stripe"]')).not.toBeDisabled();
      await expect(page.locator('[name="capacity"]')).not.toBeDisabled();

      // 編集して保存
      await page.fill('[name="title"]', "編集済みイベント");
      await page.fill('[name="fee"]', "2000");
      await page.click('button[type="submit"]');

      // 変更確認ダイアログが表示されることを確認
      await expect(page.locator('[data-testid="change-confirmation-dialog"]')).toBeVisible();
      await expect(page.locator('[data-testid="change-item-title"]')).toContainText(
        "編集済みイベント"
      );
      await expect(page.locator('[data-testid="change-item-fee"]')).toContainText("2000");

      // 変更を確定
      await page.click('[data-testid="confirm-changes-button"]');

      // 成功メッセージを確認
      await expect(page.locator('[data-testid="success-message"]')).toContainText(
        "イベントが更新されました"
      );
    });

    test("参加者がいる場合、制限項目が無効化される", async ({ page }) => {
      // 参加者がいるイベントのモックデータを設定
      // （実際の実装では、テストデータベースに参加者を事前に作成）

      await page.goto("/events/test-event-with-attendees/edit");

      // 制限項目が無効化されていることを確認
      await expect(page.locator('[name="title"]')).toBeDisabled();
      await expect(page.locator('[name="fee"]')).toBeDisabled();
      await expect(page.locator('[name="payment_methods"][value="stripe"]')).toBeDisabled();

      // 編集可能項目は有効であることを確認
      await expect(page.locator('[name="description"]')).not.toBeDisabled();
      await expect(page.locator('[name="location"]')).not.toBeDisabled();

      // 制限理由の説明が表示されることを確認
      await expect(page.locator('[data-testid="restriction-notice"]')).toContainText(
        "参加者がいるため、一部の項目は変更できません"
      );
    });
  });

  test.describe("イベント削除フロー", () => {
    test("参加者がいないイベントは削除可能", async ({ page }) => {
      // テストイベントを作成
      await page.goto("/events/new");
      await page.fill('[name="title"]', "削除テストイベント");
      await page.fill('[name="date"]', "2024-12-31T18:00");
      await page.fill('[name="fee"]', "1000");
      await page.check('[name="payment_methods"][value="stripe"]');
      await page.click('button[type="submit"]');
      await page.waitForURL(/\/events\/[a-f0-9-]+$/);

      // 削除ボタンをクリック
      await page.click('[data-testid="delete-event-button"]');

      // 確認ダイアログが表示されることを確認
      await expect(page.locator('[data-testid="delete-confirmation-dialog"]')).toBeVisible();
      await expect(page.locator('[data-testid="delete-confirmation-message"]')).toContainText(
        "このイベントを削除しますか？"
      );

      // 削除を確定
      await page.click('[data-testid="confirm-delete-button"]');

      // ダッシュボードにリダイレクトされることを確認
      await page.waitForURL("/dashboard");
      await expect(page.locator('[data-testid="success-message"]')).toContainText(
        "イベントが削除されました"
      );
    });

    test("参加者がいるイベントは削除不可", async ({ page }) => {
      await page.goto("/events/test-event-with-attendees");

      // 削除ボタンが無効化されていることを確認
      await expect(page.locator('[data-testid="delete-event-button"]')).toBeDisabled();

      // 削除不可の理由が表示されることを確認
      await expect(page.locator('[data-testid="delete-restriction-notice"]')).toContainText(
        "参加者がいるため、このイベントは削除できません"
      );
    });
  });

  test.describe("招待リンク管理", () => {
    test("招待リンクが正常に生成・表示される", async ({ page }) => {
      await page.goto("/events/test-event");

      // 招待リンクが表示されることを確認
      await expect(page.locator('[data-testid="invite-link"]')).toBeVisible();

      // コピーボタンが動作することを確認
      await page.click('[data-testid="copy-invite-link-button"]');
      await expect(page.locator('[data-testid="copy-success-message"]')).toContainText(
        "招待リンクをコピーしました"
      );

      // QRコードが表示されることを確認
      await page.click('[data-testid="show-qr-code-button"]');
      await expect(page.locator('[data-testid="qr-code-modal"]')).toBeVisible();
      await expect(page.locator('[data-testid="qr-code-image"]')).toBeVisible();
    });
  });
});

test.describe("レスポンシブデザイン", () => {
  test("モバイルデバイスでイベント作成フローが正常に動作する", async ({ page }) => {
    // モバイルビューポートに設定
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto("/auth/login");
    await page.fill('[name="email"]', "test@eventpay.test");
    await page.fill('[name="password"]', "testpassword123");
    await page.click('button[type="submit"]');
    await page.waitForURL("/dashboard");

    // モバイルメニューからイベント作成に遷移
    await page.click('[data-testid="mobile-menu-button"]');
    await page.click('[data-testid="mobile-create-event-button"]');
    await page.waitForURL("/events/new");

    // モバイルでのフォーム操作
    await page.fill('[name="title"]', "モバイルテストイベント");
    await page.fill('[name="date"]', "2024-12-31T18:00");
    await page.fill('[name="fee"]', "1000");
    await page.check('[name="payment_methods"][value="stripe"]');

    // モバイルでのフォーム送信
    await page.click('button[type="submit"]');
    await expect(page.locator('[data-testid="success-message"]')).toContainText(
      "イベントが作成されました"
    );
  });
});
