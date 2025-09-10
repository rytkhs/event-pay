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
    const paymentButton = page.locator(
      'button:has-text("支払う"), button:has-text("再決済へ進む")'
    );
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
    expect(currentUrl).toMatch(/^https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test_/);

    // session_idパラメータの確認
    const url = new URL(currentUrl);
    const fragment = url.hash;
    expect(fragment).toContain("cs_test_");
  }
}

// テストスイート
test.describe("決済フロー E2E - 正常系", () => {
  // 各テスト前の共通セットアップ
  test.beforeEach(async ({ page }) => {
    // 固定時刻の設定
    await page.addInitScript(`{
      const fixedTime = new Date('${FIXED_TIME.toISOString()}');
      Date.now = () => fixedTime.getTime();
      Date.prototype.constructor = function(...args) {
        if (args.length === 0) {
          return fixedTime;
        }
        return new (Date.constructor.bind.apply(Date, [null, ...args]));
      };
    }`);

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
    const payment = await TestDataManager.verifyPayment(1500, "pending");
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
    await expect(page.locator("text=¥2,000")).toBeVisible();

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

    // 変更期限を過ぎた設定でイベント更新
    const pastDeadline = new Date(FIXED_TIME.getTime() - 24 * 60 * 60 * 1000).toISOString();
    await TestDataManager.updateEventDeadline(pastDeadline);

    // ゲスト管理ページにアクセス
    await PageHelper.navigateToGuestPage(page, attendance.guest_token);

    // 変更期限過ぎの警告表示確認
    await expect(page.locator("text=参加状況の変更期限を過ぎているため")).toBeVisible();

    // 再決済ボタンの表示確認
    const repayButton = page.locator('button:has-text("再決済へ進む")');
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
});
