/**
 * 決済フロー E2E テスト - 正常系
 *
 * P0タスク7: UI経由での決済開始フロー検証
 * - Stripe Test Mode使用
 * - 固定クロック・ID・idempotency keyでフレーク防止
 * - 3つの正常系シナリオを網羅
 * - データベース直接操作でテストデータ管理
 */

import { test, expect, type Page } from "@playwright/test";

import { TestDataManager, FIXED_TIME } from "./helpers/test-data-setup";

/**
 * ページヘルパー関数
 */
class PageHelper {
  /**
   * ゲスト管理ページにアクセス
   */
  static async navigateToGuestPage(page: Page, guestToken: string): Promise<void> {
    await page.goto(`/guest/${guestToken}`);
    await page.waitForLoadState("networkidle");
  }

  /**
   * 支払いボタンをクリック
   */
  static async clickPaymentButton(page: Page): Promise<void> {
    const paymentButton = page.locator('button:has-text("決済を完了する")');
    await expect(paymentButton).toBeVisible();
    await expect(paymentButton).toBeEnabled();

    await paymentButton.click();
  }

  /**
   * ローディング状態を確認
   */
  static async verifyLoadingState(page: Page): Promise<void> {
    const loadingButton = page.locator('button:has-text("決済準備中...")');
    await expect(loadingButton).toBeVisible();

    const spinner = page.locator(".animate-spin");
    await expect(spinner).toBeVisible();
  }

  /**
   * Stripe Checkout URLへのリダイレクトを確認
   */
  static async verifyStripeRedirect(page: Page): Promise<void> {
    // リダイレクトを待機（最大30秒）
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30000 });

    const currentUrl = page.url();
    // この正規表現で、URLのパスにcs_test_が含まれていることを十分に検証できています。
    expect(currentUrl).toMatch(/^https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test_/);
  }
}

// テストスイート
test.describe("決済フロー E2E - 正常系", () => {
  // 各テスト前の共通セットアップ
  test.beforeEach(async ({ page }) => {
    // 固定時刻の設定
    await page.clock.setFixedTime(FIXED_TIME);

    // UUID固定化
    await page.addInitScript(`{
      const crypto = window.crypto || window.msCrypto;
      if (crypto && crypto.getRandomValues) {
        const originalGetRandomValues = crypto.getRandomValues.bind(crypto);
        let counter = 0;
        crypto.getRandomValues = function(array) {
          // 固定パターンで配列を埋める
          for (let i = 0; i < array.length; i++) {
            array[i] = (counter + i) % 256;
          }
          counter += array.length;
          return array;
        };
      }
    }`);

    // 共通テストデータ作成（データベース直接操作）
    await TestDataManager.createUserWithConnect();
    await TestDataManager.createPaidEvent();
  });

  // 各テスト後のクリーンアップ
  test.afterEach(async () => {
    await TestDataManager.cleanup();
  });

  test("シナリオ1: 基本的な決済フロー", async ({ page }) => {
    // テストデータ準備（データベース直接操作）
    const attendance = await TestDataManager.createAttendance();

    // ゲスト管理ページにアクセス
    await PageHelper.navigateToGuestPage(page, attendance.guest_token);

    // ページ内容の確認
    // banner 内のイベントタイトルは一意に存在するため、banner role でスコープを絞る
    await expect(page.getByRole("banner").getByText("E2Eテスト有料イベント")).toBeVisible();
    await expect(page.getByText("参加費: 3,000円", { exact: true })).toBeVisible();

    // 支払いボタンクリック
    await PageHelper.clickPaymentButton(page);

    // ローディング状態確認
    await PageHelper.verifyLoadingState(page);

    // Stripe Checkout URLへのリダイレクト確認
    await PageHelper.verifyStripeRedirect(page);

    // DBの状態確認（新しいpaymentレコード作成）
    const payment = await TestDataManager.verifyPayment(3000, "pending");
    expect(payment).toBeDefined();
  });

  test("シナリオ2: 既存金額優先フロー", async ({ page }) => {
    // 既存paymentありの参加者作成
    const attendance = await TestDataManager.createAttendance({
      existingPayment: {
        amount: 2000, // イベント料金(1500)と異なる金額
        status: "pending",
      },
    });

    // ゲスト管理ページにアクセス
    await PageHelper.navigateToGuestPage(page, attendance.guest_token);

    // 既存の決済情報表示確認
    await expect(page.getByText("¥2,000")).toBeVisible();

    // 支払いボタンクリック
    await PageHelper.clickPaymentButton(page);

    // ローディング状態確認
    await PageHelper.verifyLoadingState(page);

    // Stripe Checkout URLへのリダイレクト確認
    await PageHelper.verifyStripeRedirect(page);

    // DBの状態確認（既存paymentが更新、金額は2000円）
    const payment = await TestDataManager.verifyPayment(2000, "pending");
    expect(payment).toBeDefined();
  });

  test("シナリオ3: 再決済フロー", async ({ page }) => {
    // 決済失敗済みの参加者作成
    const attendance = await TestDataManager.createAttendance({
      existingPayment: {
        amount: 1500,
        status: "failed",
      },
    });

    // 変更期限を過ぎた設定でイベント更新（サーバ時間基準でも常に過去）
    await TestDataManager.updateEventDeadline("2000-01-01T00:00:00.000Z");

    // ゲスト管理ページにアクセス
    await PageHelper.navigateToGuestPage(page, attendance.guest_token);

    // 変更期限過ぎの警告表示確認
    const alertContainer = page.getByRole("region", { name: "参加状況変更不可" });
    await expect(alertContainer).toContainText("参加状況の変更期限を過ぎているため");

    // 再決済ボタンの表示確認
    const repayButton = page.getByRole("button", { name: "決済を完了する" });
    await expect(repayButton).toBeVisible();

    // 再決済ボタンクリック
    await repayButton.click();

    // ローディング状態確認
    await PageHelper.verifyLoadingState(page);

    // Stripe Checkout URLへのリダイレクト確認
    await PageHelper.verifyStripeRedirect(page);

    // DBの状態確認（新しいCheckoutセッション作成）
    const payment = await TestDataManager.verifyPayment(1500, "pending");
    expect(payment).toBeDefined();
  });

  test("シナリオ4: 期限後の初回決済フロー", async ({ page }) => {
    // 参加者（既存paymentなし）を作成
    const attendance = await TestDataManager.createAttendance();

    // 変更期限を過ぎた状態にイベントを更新（常に過去）
    await TestDataManager.updateEventDeadline("2000-01-01T00:00:00.000Z");

    // ゲスト管理ページへ
    await PageHelper.navigateToGuestPage(page, attendance.guest_token);

    // 変更期限超過のアラート表示を確認（参加変更は不可だが決済は許可）
    const alert = page.getByRole("region", { name: "参加状況変更不可" });
    await expect(alert).toContainText("参加状況の変更期限を過ぎているため");

    // 決済ボタンが表示・有効であることを確認しクリック
    const payButton = page.getByRole("button", { name: "決済を完了する" });
    await expect(payButton).toBeVisible();
    await expect(payButton).toBeEnabled();
    await payButton.click();

    // ローディング状態を確認
    await PageHelper.verifyLoadingState(page);

    // Stripe Checkout へのリダイレクトを確認
    await PageHelper.verifyStripeRedirect(page);

    // DB検証：初回決済なのでイベント料金でpendingのpaymentが作成される（fee=3000）
    const payment = await TestDataManager.verifyPayment(3000, "pending");
    expect(payment).toBeDefined();
  });
});
