import { test, expect } from "@playwright/test";
import {
  loginAsTestUser,
  createTestEvent,
  setupMobileView,
  setupTabletView,
  clearAccountLockout
} from "./helpers/rhf-test-helpers";

/**
 * 招待リンク参加機能 E2Eテスト
 * 
 * テスト対象:
 * - 招待リンクから参加確認までの完全なユーザージャーニー
 * - エラーシナリオとエッジケース
 * - モバイルデバイス互換性
 * - セキュリティ対策の有効性
 */

test.describe("招待リンク参加機能", () => {
  let eventId: string;
  let inviteToken: string;
  let inviteUrl: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();

    // テスト用イベント作成者でログイン
    await clearAccountLockout("creator@eventpay.test");
    await loginAsTestUser(page, "creator@eventpay.test");

    // テスト用イベントを作成
    eventId = await createTestEvent(page, {
      title: "招待リンクテストイベント",
      description: "招待リンク参加機能のE2Eテスト用イベント",
      location: "テスト会場",
      date: "2024-12-31T19:00",
      fee: "1500",
      capacity: "10",
      paymentMethods: ["stripe", "cash"]
    });

    // 招待トークンを取得（実際の実装に合わせて調整）
    await page.goto(`/events/${eventId}`);
    // 招待リンクまたはトークンを取得する方法を実装に合わせて調整
    const inviteElement = page.locator('[data-testid="invite-link"], [data-testid="invite-token"], input[readonly]').first();
    const inviteValue = await inviteElement.inputValue().catch(() => inviteElement.textContent());

    if (inviteValue?.includes('/invite/')) {
      inviteUrl = inviteValue;
      inviteToken = inviteValue.split('/invite/')[1];
    } else {
      inviteToken = inviteValue || "";
      inviteUrl = `http://localhost:3000/invite/${inviteToken}`;
    }

    await page.close();
  });

  test.describe("正常な参加フロー", () => {
    test("招待リンクから参加確認まで完全なフローが動作する", async ({ page }) => {
      // 1. 招待リンクにアクセス
      await page.goto(inviteUrl);

      // イベント詳細が表示されることを確認
      await expect(page.locator('h1, h2, [role="heading"]')).toContainText("招待リンクテストイベント");
      await expect(page.getByText("招待リンク参加機能のE2Eテスト用イベント")).toBeVisible();
      await expect(page.getByText("テスト会場")).toBeVisible();
      await expect(page.getByText("1,500")).toBeVisible();

      // 2. 参加フォームに入力
      await page.fill('[name="nickname"]', "テスト参加者");
      await page.fill('[name="email"]', `test-${Date.now()}@example.com`);

      // 3. 参加ステータスを選択
      await page.click('#attending');

      // 4. 支払い方法が表示されることを確認
      await expect(page.locator('label[for="stripe"]')).toBeVisible();

      // 5. クレジットカード支払いを選択
      await page.click('#stripe');

      // 6. フォーム送信
      await page.click('button[type="submit"]:has-text("参加申し込みを完了する")');

      // 7. 確認ページが表示されることを確認
      await expect(page.getByText("参加申し込みが完了しました")).toBeVisible();
      await expect(page.getByText("テスト参加者")).toBeVisible();
      await expect(page.getByText("参加")).toBeVisible();
      await expect(page.getByText("クレジットカード")).toBeVisible();

      // 8. ゲスト管理URLが表示されることを確認
      await expect(page.getByText("管理URLを表示")).toBeVisible();
      await page.click('button:has-text("管理URLを表示")');
      await expect(page.locator('p[role="textbox"]')).toBeVisible();
      const guestUrl = await page.locator('p[role="textbox"]').textContent();
      expect(guestUrl).toMatch(/\/guest\/[a-zA-Z0-9_-]+/);
    });

    test("現金支払いでの参加フローが動作する", async ({ page }) => {
      await page.goto(inviteUrl);

      await page.fill('[name="nickname"]', "現金支払い参加者");
      await page.fill('[name="email"]', `cash-${Date.now()}@example.com`);
      await page.click('#attending');
      await page.click('#cash');
      await page.click('button[type="submit"]:has-text("参加申し込みを完了する")');

      await expect(page.getByText("参加申し込みが完了しました")).toBeVisible();
      await expect(page.getByText("現金")).toBeVisible();
    });

    test("不参加での登録フローが動作する", async ({ page }) => {
      await page.goto(inviteUrl);

      await page.fill('[name="nickname"]', "不参加者");
      await page.fill('[name="email"]', `not-attending-${Date.now()}@example.com`);
      await page.click('#not_attending');

      // 支払い方法セクションが非表示になることを確認
      await expect(page.locator('label[for="stripe"]')).not.toBeVisible();

      await page.click('button[type="submit"]:has-text("参加申し込みを完了する")');

      await expect(page.getByText("参加申し込みが完了しました")).toBeVisible();
      await expect(page.getByText("不参加")).toBeVisible();
    });

    test("未定での登録フローが動作する", async ({ page }) => {
      await page.goto(inviteUrl);

      await page.fill('[name="nickname"]', "未定参加者");
      await page.fill('[name="email"]', `maybe-${Date.now()}@example.com`);
      await page.click('#maybe');

      // 支払い方法セクションが非表示になることを確認
      await expect(page.locator('label[for="stripe"]')).not.toBeVisible();

      await page.click('button[type="submit"]:has-text("参加申し込みを完了する")');

      await expect(page.getByText("参加申し込みが完了しました")).toBeVisible();
      await expect(page.getByText("未定")).toBeVisible();
    });
  });

  test.describe("ゲスト管理機能", () => {
    let guestToken: string;
    let guestUrl: string;

    test.beforeEach(async ({ page }) => {
      // 参加登録を行ってゲストトークンを取得
      await page.goto(inviteUrl);
      await page.fill('[name="nickname"]', "ゲスト管理テスト");
      await page.fill('[name="email"]', `guest-${Date.now()}@example.com`);
      await page.click('#attending');
      await page.click('#cash');
      await page.click('button[type="submit"]:has-text("参加申し込みを完了する")');

      // ゲスト管理URLを取得
      await page.click('button:has-text("管理URLを表示")');
      const guestUrlElement = page.locator('p[role="textbox"]');
      guestUrl = await guestUrlElement.textContent() || "";
      guestToken = guestUrl.split('/guest/')[1];
    });

    test("ゲスト管理ページでの参加状況確認が動作する", async ({ page }) => {
      await page.goto(guestUrl);

      // 現在の参加状況が表示されることを確認
      await expect(page.getByText("ゲスト管理テスト")).toBeVisible();
      await expect(page.getByText("参加")).toBeVisible();
      await expect(page.getByText("現金")).toBeVisible();
    });

    test("ゲスト管理ページでの参加状況変更が動作する", async ({ page }) => {
      await page.goto(guestUrl);

      // 参加状況を「未定」に変更（実際の実装に合わせて調整）
      // ゲスト管理ページの実装に応じてセレクターを調整
      const editButton = page.locator('button:has-text("編集"), button:has-text("変更")').first();
      if (await editButton.isVisible()) {
        await editButton.click();
        await page.click('#maybe');
        await page.click('button[type="submit"]');
      }

      // 変更が反映されることを確認
      await expect(page.getByText("未定")).toBeVisible();
      await expect(page.getByText("更新")).toBeVisible();
    });
  });

  test.describe("エラーシナリオ", () => {
    test("無効な招待トークンでアクセスした場合のエラー処理", async ({ page }) => {
      await page.goto("/invite/invalid-token-12345");

      // エラーメッセージが表示されることを確認
      await expect(page.getByText("無効")).toBeVisible();
      await expect(page.getByText("招待")).toBeVisible();
    });

    test("期限切れイベントでのエラー処理", async ({ browser }) => {
      // 期限切れイベントを作成
      const page = await browser.newPage();
      await loginAsTestUser(page, "creator@eventpay.test");

      const expiredEventId = await createTestEvent(page, {
        title: "期限切れテストイベント",
        date: "2020-01-01T19:00", // 過去の日付
        fee: "1000",
        paymentMethods: ["cash"]
      });

      await page.goto(`/events/${expiredEventId}`);
      // 招待トークンを取得（実際の実装に合わせて調整）
      const inviteElement = page.locator('[data-testid="invite-link"], [data-testid="invite-token"], input[readonly]').first();
      const inviteValue = await inviteElement.inputValue().catch(() => inviteElement.textContent());
      let expiredToken = "";
      if (inviteValue?.includes('/invite/')) {
        expiredToken = inviteValue.split('/invite/')[1];
      } else {
        expiredToken = inviteValue || "";
      }
      await page.close();

      // 期限切れイベントにアクセス
      await page.goto(`/invite/${expiredToken}`);

      await expect(page.getByText("終了")).toBeVisible();
    });

    test("定員超過時のエラー処理", async ({ browser }) => {
      // 定員1のイベントを作成
      const page = await browser.newPage();
      await loginAsTestUser(page, "creator@eventpay.test");

      const limitedEventId = await createTestEvent(page, {
        title: "定員制限テストイベント",
        date: "2024-12-31T19:00",
        fee: "1000",
        capacity: "1",
        paymentMethods: ["cash"]
      });

      await page.goto(`/events/${limitedEventId}`);
      // 招待トークンを取得
      const inviteElement = page.locator('[data-testid="invite-link"], [data-testid="invite-token"], input[readonly]').first();
      const inviteValue = await inviteElement.inputValue().catch(() => inviteElement.textContent());
      let limitedToken = "";
      if (inviteValue?.includes('/invite/')) {
        limitedToken = inviteValue.split('/invite/')[1];
      } else {
        limitedToken = inviteValue || "";
      }
      await page.close();

      // 1人目の参加登録
      await page.goto(`/invite/${limitedToken}`);
      await page.fill('[name="nickname"]', "1人目");
      await page.fill('[name="email"]', `first-${Date.now()}@example.com`);
      await page.click('#attending');
      await page.click('#cash');
      await page.click('button[type="submit"]:has-text("参加申し込みを完了する")');

      // 2人目がアクセスした場合
      await page.goto(`/invite/${limitedToken}`);
      await page.fill('[name="nickname"]', "2人目");
      await page.fill('[name="email"]', `second-${Date.now()}@example.com`);
      await page.click('#attending');
      await page.click('#cash');
      await page.click('button[type="submit"]:has-text("参加申し込みを完了する")');

      // 定員超過エラーが表示されることを確認
      await expect(page.getByText("定員")).toBeVisible();
    });

    test("重複メールアドレスでのエラー処理", async ({ page }) => {
      const duplicateEmail = `duplicate-${Date.now()}@example.com`;

      // 1回目の登録
      await page.goto(inviteUrl);
      await page.fill('[name="nickname"]', "1回目登録");
      await page.fill('[name="email"]', duplicateEmail);
      await page.click('#attending');
      await page.click('#cash');
      await page.click('button[type="submit"]:has-text("参加申し込みを完了する")');

      // 2回目の登録（同じメールアドレス）
      await page.goto(inviteUrl);
      await page.fill('[name="nickname"]', "2回目登録");
      await page.fill('[name="email"]', duplicateEmail);
      await page.click('#attending');
      await page.click('#cash');
      await page.click('button[type="submit"]:has-text("参加申し込みを完了する")');

      // 重複エラーが表示されることを確認
      await expect(page.getByText("既に登録")).toBeVisible();
    });
  });

  test.describe("フォームバリデーション", () => {
    test("必須項目のバリデーションが機能する", async ({ page }) => {
      await page.goto(inviteUrl);

      // 空のフォームで送信
      await page.click('button[type="submit"]:has-text("参加申し込みを完了する")');

      // バリデーションエラーが表示されることを確認
      await expect(page.getByText("ニックネームを入力してください")).toBeVisible();
      await expect(page.getByText("メールアドレスを入力してください")).toBeVisible();
    });

    test("メールアドレス形式のバリデーションが機能する", async ({ page }) => {
      await page.goto(inviteUrl);

      await page.fill('[name="nickname"]', "テスト");
      await page.fill('[name="email"]', "invalid-email");
      await page.click('#attending');
      await page.click('#cash');
      await page.click('button[type="submit"]:has-text("参加申し込みを完了する")');

      await expect(page.getByText("有効なメールアドレス")).toBeVisible();
    });

    test("ニックネーム長さ制限のバリデーションが機能する", async ({ page }) => {
      await page.goto(inviteUrl);

      // 50文字を超えるニックネーム
      const longNickname = "a".repeat(51);
      await page.fill('[name="nickname"]', longNickname);
      await page.fill('[name="email"]', "test@example.com");
      await page.click('#attending');
      await page.click('#cash');
      await page.click('button[type="submit"]:has-text("参加申し込みを完了する")');

      await expect(page.getByText("50文字以内")).toBeVisible();
    });

    test("参加時の支払い方法選択バリデーションが機能する", async ({ page }) => {
      await page.goto(inviteUrl);

      await page.fill('[name="nickname"]', "テスト");
      await page.fill('[name="email"]', "test@example.com");
      await page.click('#attending');
      // 支払い方法を選択せずに送信
      await page.click('button[type="submit"]:has-text("参加申し込みを完了する")');

      await expect(page.getByText("支払い方法")).toBeVisible();
    });
  });

  test.describe("セキュリティ対策", () => {
    test("レート制限が機能する", async ({ page }) => {
      // 短時間で複数回のリクエストを送信
      const promises = [];
      for (let i = 0; i < 12; i++) {
        promises.push(
          page.goto(inviteUrl).catch(() => { }) // エラーを無視
        );
      }

      await Promise.all(promises);

      // レート制限エラーが表示されることを確認（実際の実装に合わせて調整）
      await expect(page.getByText("多すぎます").or(page.getByText("制限"))).toBeVisible();
    });

    test("XSS攻撃の防止が機能する", async ({ page }) => {
      await page.goto(inviteUrl);

      // XSSペイロードを含む入力
      const xssPayload = '<script>alert("XSS")</script>';
      await page.fill('[name="nickname"]', xssPayload);
      await page.fill('[name="email"]', "test@example.com");
      await page.click('#attending');
      await page.click('#cash');
      await page.click('button[type="submit"]:has-text("参加申し込みを完了する")');

      // スクリプトが実行されないことを確認
      const alerts = [];
      page.on('dialog', dialog => {
        alerts.push(dialog.message());
        dialog.dismiss();
      });

      await page.waitForTimeout(1000);
      expect(alerts).toHaveLength(0);

      // サニタイズされた値が表示されることを確認
      const nicknameText = await page.textContent('body');
      expect(nicknameText).not.toContain('<script>');
    });

    test("無効なゲストトークンでのアクセス防止", async ({ page }) => {
      await page.goto("/guest/invalid-guest-token-12345");

      await expect(page.getByText("無効")).toBeVisible();
    });
  });

  test.describe("モバイル互換性", () => {
    test("モバイルデバイスでの参加フローが正常に動作する", async ({ page }) => {
      await setupMobileView(page);

      await page.goto(inviteUrl);

      // モバイルビューでのレイアウト確認（フォームが表示されることを確認）
      await expect(page.locator('form')).toBeVisible();

      // タッチ操作での入力
      await page.tap('[name="nickname"]');
      await page.fill('[name="nickname"]', "モバイルユーザー");

      await page.tap('[name="email"]');
      await page.fill('[name="email"]', `mobile-${Date.now()}@example.com`);

      // タッチでの選択操作
      await page.tap('#attending');
      await page.tap('#stripe');

      // モバイルでの送信
      await page.tap('button[type="submit"]:has-text("参加申し込みを完了する")');

      // 確認ページがモバイルで適切に表示される
      await expect(page.getByText("参加申し込みが完了しました")).toBeVisible();
    });

    test("タブレットデバイスでの参加フローが正常に動作する", async ({ page }) => {
      await setupTabletView(page);

      await page.goto(inviteUrl);

      // タブレットビューでのレイアウト確認
      await expect(page.locator('form')).toBeVisible();

      await page.fill('[name="nickname"]', "タブレットユーザー");
      await page.fill('[name="email"]', `tablet-${Date.now()}@example.com`);
      await page.click('#attending');
      await page.click('#cash');
      await page.click('button[type="submit"]:has-text("参加申し込みを完了する")');

      await expect(page.getByText("参加申し込みが完了しました")).toBeVisible();
    });

    test("画面回転時のレイアウト維持", async ({ page }) => {
      await setupMobileView(page);

      await page.goto(inviteUrl);
      await page.fill('[name="nickname"]', "回転テスト");

      // 横向きに回転
      await page.setViewportSize({ width: 667, height: 375 });

      // 入力内容が維持されることを確認
      await expect(page.locator('[name="nickname"]')).toHaveValue("回転テスト");

      // レイアウトが適切に調整されることを確認（フォームが表示されることを確認）
      await expect(page.locator('form')).toBeVisible();
    });
  });

  test.describe("アクセシビリティ", () => {
    test("キーボードナビゲーションが機能する", async ({ page }) => {
      await page.goto(inviteUrl);

      // Tabキーでのフォーカス移動
      await page.keyboard.press('Tab');
      await expect(page.locator('[name="nickname"]')).toBeFocused();

      await page.keyboard.press('Tab');
      await expect(page.locator('[name="email"]')).toBeFocused();

      await page.keyboard.press('Tab');
      await expect(page.locator('#attending')).toBeFocused();
    });

    test("スクリーンリーダー対応のARIA属性が設定されている", async ({ page }) => {
      await page.goto(inviteUrl);

      // ARIA属性の確認（実際の実装に合わせて調整）
      await expect(page.locator('[name="nickname"]')).toHaveAttribute('aria-required', 'true');
      await expect(page.locator('[name="email"]')).toHaveAttribute('aria-required', 'true');
      await expect(page.locator('[role="radiogroup"]')).toBeVisible();
    });

    test("エラーメッセージがスクリーンリーダーで読み上げられる", async ({ page }) => {
      await page.goto(inviteUrl);

      await page.click('button[type="submit"]:has-text("参加申し込みを完了する")');

      // エラーメッセージが適切に表示されることを確認
      await expect(page.locator('[role="alert"]')).toBeVisible();
    });
  });

  test.describe("パフォーマンス", () => {
    test("ページ読み込み時間が適切である", async ({ page }) => {
      const startTime = Date.now();
      await page.goto(inviteUrl);
      await page.waitForLoadState('networkidle');
      const loadTime = Date.now() - startTime;

      // 3秒以内に読み込まれることを確認
      expect(loadTime).toBeLessThan(3000);
    });

    test("フォーム送信のレスポンス時間が適切である", async ({ page }) => {
      await page.goto(inviteUrl);

      await page.fill('[name="nickname"]', "パフォーマンステスト");
      await page.fill('[name="email"]', `perf-${Date.now()}@example.com`);
      await page.click('#attending');
      await page.click('#cash');

      const startTime = Date.now();
      await page.click('button[type="submit"]:has-text("参加申し込みを完了する")');
      await page.waitForSelector('text=参加申し込みが完了しました');
      const responseTime = Date.now() - startTime;

      // 5秒以内にレスポンスが返ることを確認
      expect(responseTime).toBeLessThan(5000);
    });
  });
});