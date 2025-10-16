/**
 * お問い合わせフォーム - E2Eテスト
 * Playwright を使用したブラウザテスト
 */

import { test, expect } from "@playwright/test";

test.describe("お問い合わせフォーム", () => {
  test.beforeEach(async ({ page }) => {
    // お問い合わせページに移動
    await page.goto("/contact");
  });

  test("フォームが正しく表示される", async ({ page }) => {
    // タイトルの確認
    await expect(page.getByRole("heading", { name: "お問い合わせ" })).toBeVisible();

    // フォームフィールドの確認
    await expect(page.getByTestId("contact-name-input")).toBeVisible();
    await expect(page.getByTestId("contact-email-input")).toBeVisible();
    await expect(page.getByTestId("contact-message-input")).toBeVisible();
    await expect(page.getByTestId("contact-consent-checkbox")).toBeVisible();
    await expect(page.getByTestId("contact-submit-button")).toBeVisible();
  });

  test.skip("有効な入力で送信が成功する", async ({ page }) => {
    // フォーム入力
    await page.getByTestId("contact-name-input").fill("山田 太郎");
    await page.getByTestId("contact-email-input").fill("test@example.com");
    await page
      .getByTestId("contact-message-input")
      .fill("これはE2Eテストのお問い合わせです。テストメッセージの内容を記載しています。");
    await page.getByTestId("contact-consent-checkbox").check();

    // 送信
    await page.getByTestId("contact-submit-button").click();

    // 成功メッセージの確認
    await expect(page.getByText("送信完了")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("お問い合わせを受け付けました")).toBeVisible();
  });

  test("必須フィールドが空の場合バリデーションエラーが表示される", async ({ page }) => {
    // 空のまま送信
    await page.getByTestId("contact-submit-button").click();

    // エラーメッセージの確認
    await expect(page.getByText("氏名を入力してください")).toBeVisible();
    await expect(page.getByText("有効なメールアドレスを入力してください")).toBeVisible();
    await expect(page.getByText("お問い合わせ内容は10文字以上で入力してください")).toBeVisible();
  });

  test("不正なメールアドレスでバリデーションエラーが表示される", async ({ page }) => {
    // 不正なメールアドレスを入力
    await page.getByTestId("contact-name-input").fill("山田 太郎");
    await page.getByTestId("contact-email-input").fill("invalid-email");
    await page
      .getByTestId("contact-message-input")
      .fill("これはテストのお問い合わせです。10文字以上の内容を記載しています。");
    await page.getByTestId("contact-consent-checkbox").check();

    // フォーカスを移動してバリデーションをトリガー
    await page.getByTestId("contact-message-input").click();

    // エラーメッセージの確認
    await expect(page.getByText("有効なメールアドレスを入力してください")).toBeVisible();
  });

  test("メッセージが10文字未満の場合バリデーションエラーが表示される", async ({ page }) => {
    // 短いメッセージを入力
    await page.getByTestId("contact-name-input").fill("山田 太郎");
    await page.getByTestId("contact-email-input").fill("test@example.com");
    await page.getByTestId("contact-message-input").fill("短い");
    await page.getByTestId("contact-consent-checkbox").check();

    // フォーカスを移動してバリデーションをトリガー
    await page.getByTestId("contact-name-input").click();

    // エラーメッセージの確認
    await expect(page.getByText("お問い合わせ内容は10文字以上で入力してください")).toBeVisible();
  });

  test("プライバシーポリシーのリンクが正しく機能する", async ({ page }) => {
    // リンクの存在確認
    const privacyLink = page.getByRole("link", { name: /プライバシーポリシー/i });
    await expect(privacyLink).toBeVisible();

    // リンク属性の確認
    await expect(privacyLink).toHaveAttribute("href", "/privacy");
    await expect(privacyLink).toHaveAttribute("target", "_blank");
  });

  test("送信ボタンが送信中は無効化される", async ({ page }) => {
    // フォーム入力
    await page.getByTestId("contact-name-input").fill("山田 太郎");
    await page.getByTestId("contact-email-input").fill("test@example.com");
    await page
      .getByTestId("contact-message-input")
      .fill("これはテストのお問い合わせです。10文字以上の内容を記載しています。");
    await page.getByTestId("contact-consent-checkbox").check();

    // 送信ボタンをクリック
    const submitButton = page.getByTestId("contact-submit-button");
    await submitButton.click();

    // ボタンが無効化されていることを確認
    await expect(submitButton).toBeDisabled();
    await expect(submitButton).toHaveText("送信中...");
  });

  test.skip("レート制限に達した場合エラーメッセージが表示される", async ({ page }) => {
    // 複数回送信してレート制限をトリガー
    for (let i = 0; i < 6; i++) {
      await page.getByTestId("contact-name-input").fill(`テストユーザー ${i}`);
      await page.getByTestId("contact-email-input").fill(`test${i}@example.com`);
      await page
        .getByTestId("contact-message-input")
        .fill(`レート制限テスト ${i + 1}回目の送信です。これは10文字以上の内容です。`);
      await page.getByTestId("contact-consent-checkbox").check();
      await page.getByTestId("contact-submit-button").click();

      if (i < 5) {
        // 成功するまで待機
        await expect(page.getByText("送信完了")).toBeVisible({ timeout: 5000 });
        // ページリロードして次の送信準備
        await page.reload();
      }
    }

    // 6回目はレート制限エラー
    await expect(page.getByText(/リクエスト回数の上限に達しました/i)).toBeVisible();
  });
});
