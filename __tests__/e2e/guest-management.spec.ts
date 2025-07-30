import { test, expect } from "@playwright/test";

test.describe("ゲスト自己管理ページ", () => {
  const validGuestToken = "test-guest-token-123456789012";
  const invalidGuestToken = "invalid-token-123456789012";

  test.beforeEach(async ({ page }) => {
    // テストデータのセットアップ（実際のテストではデータベースのセットアップが必要）
    await page.route("**/api/guest/**", async (route) => {
      const url = route.request().url();

      if (url.includes(validGuestToken)) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            data: {
              attendance: {
                id: "attendance-123",
                nickname: "テストユーザー",
                email: "test@example.com",
                status: "attending",
                guest_token: validGuestToken,
                created_at: "2024-01-01T00:00:00Z",
                updated_at: "2024-01-01T00:00:00Z",
                event: {
                  id: "event-123",
                  title: "テストイベント",
                  description: "テストイベントの説明",
                  date: "2024-12-31T15:00:00Z",
                  location: "テスト会場",
                  fee: 1000,
                  capacity: 50,
                  registration_deadline: "2024-12-30T15:00:00Z",
                  payment_deadline: "2024-12-30T15:00:00Z",
                  organizer_id: "organizer-123",
                },
                payment: {
                  id: "payment-123",
                  amount: 1000,
                  method: "stripe",
                  status: "pending",
                  created_at: "2024-01-01T00:00:00Z",
                },
              },
              canModify: true,
            },
          }),
        });
      } else {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({
            success: false,
            error: "参加データが見つかりません",
          }),
        });
      }
    });
  });

  test("有効なゲストトークンでページが表示される", async ({ page }) => {
    await page.goto(`/guest/${validGuestToken}`);

    // ページタイトルの確認
    await expect(page.locator("h1")).toContainText("参加状況管理");
    await expect(page.locator("p")).toContainText("テストイベント");

    // セキュリティ警告の確認
    await expect(page.locator("text=このページのURLは他の人と共有しないでください")).toBeVisible();

    // 現在の参加状況の確認
    await expect(page.locator("text=現在の参加状況")).toBeVisible();
    await expect(page.locator("text=参加")).toBeVisible();
    await expect(page.locator("text=クレジットカード")).toBeVisible();
    await expect(page.locator("text=未完了")).toBeVisible();

    // イベント詳細の確認
    await expect(page.locator("text=テストイベント")).toBeVisible();
    await expect(page.locator("text=テスト会場")).toBeVisible();
    await expect(page.locator("text=1,000円")).toBeVisible();

    // 参加者情報の確認
    await expect(page.locator("text=テストユーザー")).toBeVisible();
    await expect(page.locator("text=test@example.com")).toBeVisible();
  });

  test("無効なゲストトークンで404エラーが表示される", async ({ page }) => {
    const response = await page.goto(`/guest/${invalidGuestToken}`);
    expect(response?.status()).toBe(404);
  });

  test("参加状況の変更ができる", async ({ page }) => {
    // 更新APIのモック
    await page.route("**/events/actions/update-guest-attendance", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            attendanceId: "attendance-123",
            status: "not_attending",
            requiresPayment: false,
          },
        }),
      });
    });

    await page.goto(`/guest/${validGuestToken}`);

    // 参加状況変更フォームの確認
    await expect(page.locator("text=参加状況の変更")).toBeVisible();

    // 現在は「参加」が選択されている
    await expect(page.locator('input[value="attending"]')).toBeChecked();

    // 「不参加」に変更
    await page.locator('input[value="not_attending"]').check();

    // 決済方法の選択肢が非表示になることを確認
    await expect(page.locator("text=決済方法")).not.toBeVisible();

    // 変更を保存ボタンが有効になることを確認
    const saveButton = page.locator('button:has-text("変更を保存")');
    await expect(saveButton).not.toBeDisabled();

    // フォーム送信
    await saveButton.click();

    // 成功メッセージの確認
    await expect(page.locator("text=参加状況を更新しました")).toBeVisible();
  });

  test("決済方法の変更ができる", async ({ page }) => {
    // 更新APIのモック
    await page.route("**/events/actions/update-guest-attendance", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            attendanceId: "attendance-123",
            status: "attending",
            paymentMethod: "cash",
            requiresPayment: true,
          },
        }),
      });
    });

    await page.goto(`/guest/${validGuestToken}`);

    // 現在は「クレジットカード」が選択されている
    await expect(page.locator('input[value="stripe"]')).toBeChecked();

    // 「現金」に変更
    await page.locator('input[value="cash"]').check();

    // 変更を保存
    const saveButton = page.locator('button:has-text("変更を保存")');
    await saveButton.click();

    // 成功メッセージの確認
    await expect(page.locator("text=参加状況を更新しました")).toBeVisible();
  });

  test("変更がない場合は保存ボタンが無効", async ({ page }) => {
    await page.goto(`/guest/${validGuestToken}`);

    // 変更を保存ボタンが無効であることを確認
    const saveButton = page.locator('button:has-text("変更を保存")');
    await expect(saveButton).toBeDisabled();
  });

  test("エラー時にエラーメッセージが表示される", async ({ page }) => {
    // 更新APIでエラーを返すモック
    await page.route("**/events/actions/update-guest-attendance", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: "更新に失敗しました",
        }),
      });
    });

    await page.goto(`/guest/${validGuestToken}`);

    // 不参加に変更
    await page.locator('input[value="not_attending"]').check();

    // フォーム送信
    const saveButton = page.locator('button:has-text("変更を保存")');
    await saveButton.click();

    // エラーメッセージの確認
    await expect(page.locator("text=更新に失敗しました")).toBeVisible();
  });

  test("変更不可の場合は警告が表示される", async ({ page }) => {
    // 変更不可のデータを返すモック
    await page.route(`**/api/guest/${validGuestToken}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            attendance: {
              id: "attendance-123",
              nickname: "テストユーザー",
              email: "test@example.com",
              status: "attending",
              guest_token: validGuestToken,
              created_at: "2024-01-01T00:00:00Z",
              updated_at: "2024-01-01T00:00:00Z",
              event: {
                id: "event-123",
                title: "テストイベント",
                description: "テストイベントの説明",
                date: "2024-01-01T15:00:00Z", // 過去の日付
                location: "テスト会場",
                fee: 1000,
                capacity: 50,
                registration_deadline: "2024-01-01T15:00:00Z",
                payment_deadline: "2024-01-01T15:00:00Z",
                organizer_id: "organizer-123",
              },
              payment: null,
            },
            canModify: false, // 変更不可
          },
        }),
      });
    });

    await page.goto(`/guest/${validGuestToken}`);

    // 変更不可の警告が表示されることを確認
    await expect(page.locator("text=参加状況の変更期限を過ぎているため")).toBeVisible();

    // フォームが表示されないことを確認
    await expect(page.locator("text=参加状況の変更")).not.toBeVisible();
    await expect(page.locator('button:has-text("変更を保存")')).not.toBeVisible();
  });

  test("モバイル表示でも正常に動作する", async ({ page }) => {
    // モバイルビューポートに設定
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto(`/guest/${validGuestToken}`);

    // ページが正常に表示されることを確認
    await expect(page.locator("h1")).toContainText("参加状況管理");
    await expect(page.locator("text=現在の参加状況")).toBeVisible();

    // フォームが正常に動作することを確認
    await page.locator('input[value="not_attending"]').check();

    const saveButton = page.locator('button:has-text("変更を保存")');
    await expect(saveButton).not.toBeDisabled();
  });
});