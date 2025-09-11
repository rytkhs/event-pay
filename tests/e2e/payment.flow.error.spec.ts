// 決済フロー E2E テスト - 正常系
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

import { TEST_IDS, TestDataManager, FIXED_TIME } from "./helpers/test-data-setup";

// 既存のPageHelperを使い回す（既存定義と整合）
class AbnormalPageHelper {
  static async navigateToGuestPage(page: Page, guestToken: string): Promise<void> {
    await page.goto(`/guest/${guestToken}`);
    await page.waitForLoadState("networkidle");
  }
  static async clickPaymentButton(page: Page): Promise<void> {
    const paymentButton = page.locator('button:has-text("決済を完了する")');
    await expect(paymentButton).toBeVisible();
    await expect(paymentButton).toBeEnabled();
    await paymentButton.click();
  }
  static async expectNoStripeRedirect(page: Page): Promise<void> {
    await expect(page).not.toHaveURL(/checkout\.stripe\.com/);
  }
}

// Supabase admin client（DB直接操作）
const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// DB操作ヘルパ
async function deleteConnectAccount(): Promise<void> {
  await supabaseAdmin
    .from("stripe_connect_accounts")
    .delete()
    .eq("stripe_account_id", TEST_IDS.CONNECT_ACCOUNT_ID);
}
async function setPayoutsEnabled(enabled: boolean): Promise<void> {
  await supabaseAdmin
    .from("stripe_connect_accounts")
    .update({ payouts_enabled: enabled, updated_at: new Date().toISOString() })
    .eq("stripe_account_id", TEST_IDS.CONNECT_ACCOUNT_ID);
}
async function setEventFee(amount: number): Promise<void> {
  await supabaseAdmin
    .from("events")
    .update({ fee: amount, updated_at: new Date().toISOString() })
    .eq("id", TEST_IDS.EVENT_ID);
}

test.describe("決済フロー E2E - 異常系", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(FIXED_TIME);
    await TestDataManager.createUserWithConnect();
    await TestDataManager.createPaidEvent();
  });

  test.afterEach(async () => {
    await TestDataManager.cleanup();
  });

  test("シナリオA: Connect未設定エラー", async ({ page }) => {
    const attendance = await TestDataManager.createAttendance();

    // Connectレコードを削除して未設定状態を作る
    await deleteConnectAccount();

    await AbnormalPageHelper.navigateToGuestPage(page, attendance.guest_token);
    await AbnormalPageHelper.clickPaymentButton(page);

    // トースト（エラー）表示とリダイレクト抑止
    const alert = page.getByRole("alert").filter({ hasText: "決済エラー" });
    await expect(alert).toContainText("決済エラー");
    await expect(alert).toContainText(
      "このイベントにはStripe Connectアカウントが設定されていません。"
    );
    await AbnormalPageHelper.expectNoStripeRedirect(page);
  });

  test("シナリオB: payouts_enabled=falseエラー", async ({ page }) => {
    const attendance = await TestDataManager.createAttendance();

    // 入金機能を無効化
    await setPayoutsEnabled(false);

    await AbnormalPageHelper.navigateToGuestPage(page, attendance.guest_token);
    await AbnormalPageHelper.clickPaymentButton(page);

    const alert = page.getByRole("alert").filter({ hasText: "決済エラー" });
    await expect(alert).toContainText("決済エラー");
    await expect(alert).toContainText(
      "Stripe Connectアカウントの入金機能 (payouts) が無効化されています。"
    );
    await AbnormalPageHelper.expectNoStripeRedirect(page);
  });

  test("シナリオC: 無料イベント（fee=0）は決済不要でボタン非表示", async ({ page }) => {
    await setEventFee(0);
    const attendance = await TestDataManager.createAttendance();

    await AbnormalPageHelper.navigateToGuestPage(page, attendance.guest_token);

    await expect(page.getByRole("button", { name: "決済を完了する" })).toHaveCount(0);
    await expect(page.getByText("決済不要")).toBeVisible();
  });

  test("シナリオD: 決済済み（paid）はボタン非表示", async ({ page }) => {
    const attendance = await TestDataManager.createAttendance({
      existingPayment: { amount: 3000, status: "paid" },
    });

    await AbnormalPageHelper.navigateToGuestPage(page, attendance.guest_token);

    await expect(page.getByRole("button", { name: "決済を完了する" })).toHaveCount(0);
    await expect(page.getByText("決済完了")).toBeVisible();
  });

  test("シナリオE: 無効なゲストトークンで404", async ({ page }) => {
    const response = await page.goto(`/guest/invalid-token`);
    expect(response?.status()).toBe(404);
  });
});
