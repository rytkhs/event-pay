/**
 * Stripe決済 ケース2-1: Stripe Connect関連エラー E2Eテスト
 *
 * 仕様書 docs/spec/test/e2e/stripe.md の「2-1. Stripe Connect関連エラー」に対応
 *
 * テストケース:
 * - ケース2-1-1: Connect未設定時の決済不可
 * - ケース2-1-2: payouts_enabled = false の場合の決済不可
 *
 * 前提条件:
 * - .env.test に SKIP_QSTASH_IN_TEST=true が設定されていること
 * - ローカルのSupabaseが起動していること
 *
 * 注意:
 * - Stripe CLIは不要（Webhookをトリガーしないテストのため）
 * - DB操作はSupabase Service Role Keyを使用
 *
 * 参考:
 * - https://docs.stripe.com/automated-testing
 * - Stripe公式ベストプラクティス
 */

import { test, expect } from "@playwright/test";

import { TestDataManager, TEST_IDS } from "../../helpers/test-data-setup";

test.describe("Stripe決済 ケース2-1: Stripe Connect関連エラー (PAYMENT-E2E-005)", () => {
  // 各テスト後のクリーンアップ
  test.afterEach(async () => {
    await TestDataManager.cleanup();
  });

  test("ケース2-1-1: Connect未設定時の決済不可", async ({ page }) => {
    /**
     * テストID: PAYMENT-E2E-005 (ケース2-1-1)
     * 優先度: P0
     * カバー率寄与: 8%
     *
     * 前提条件:
     * - イベント作成者がStripe Connectを未設定
     * - stripe_connect_accounts テーブルにレコードが存在しない
     *
     * 期待結果:
     * - ゲスト管理ページで決済ボタンは表示される
     * - 決済ボタンをクリックするとエラートーストが表示される
     * - エラーメッセージ: "決済の準備ができません。主催者のお支払い受付設定に不備があります。現金決済をご利用いただくか、主催者にお問い合わせください。"
     */

    console.log("=== ケース2-1-1: Connect未設定時の決済不可 ===");

    // === 1. テストデータの作成 ===
    console.log("📝 テストデータ作成中...");

    await TestDataManager.createUserWithConnect();
    await TestDataManager.createPaidEvent();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // === 2. Stripe Connectアカウントを削除 ===
    // イベント作成者のユーザーIDを取得
    const { data: eventData, error: eventError } = await supabase
      .from("events")
      .select("created_by")
      .eq("id", TEST_IDS.EVENT_ID)
      .single();

    if (eventError || !eventData) {
      throw new Error("Failed to fetch event creator");
    }

    const testUserId = eventData.created_by;

    // Stripe Connectアカウントを削除してConnect未設定状態を作成
    const { error: deleteError } = await supabase
      .from("stripe_connect_accounts")
      .delete()
      .eq("user_id", testUserId);

    if (deleteError) {
      throw new Error(`Failed to delete stripe_connect_account: ${deleteError.message}`);
    }

    console.log("✓ Stripe Connectアカウント削除完了（Connect未設定状態）");

    // === 3. 参加者作成 ===
    const attendanceData = await TestDataManager.createAttendance({
      status: "attending",
    });

    console.log("✓ 参加者作成完了");

    // === 4. ゲストページにアクセス ===
    const guestPageUrl = `http://localhost:3000/guest/${attendanceData.guest_token}`;
    await page.goto(guestPageUrl);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    console.log("✓ ゲストページに遷移");

    // === 5. 決済ボタンが表示されていることを確認 ===
    const paymentButton = page.getByRole("button", { name: "決済を完了する" });
    await expect(paymentButton).toBeVisible();

    console.log("✓ 決済ボタンが表示されている");

    // === 6. 決済ボタンをクリックしてエラーが表示されることを確認 ===
    console.log("🔍 決済ボタンをクリックしてエラー確認");

    // ボタンをクリック
    await paymentButton.click();

    // エラートーストが表示されることを確認（タイムアウト時間を長めに設定）
    const errorToast = page.getByText(
      /決済の準備ができません.*主催者のお支払い受付設定に不備があります/i
    );
    await expect(errorToast).toBeVisible({ timeout: 5000 });

    console.log("✓ エラーメッセージが表示された（Connect未設定）");

    console.log("🎉 ケース2-1-1: テスト成功（Connect未設定時の決済不可）");
  });

  test("ケース2-1-2: payouts_enabled = false の場合の決済不可", async ({ page }) => {
    /**
     * テストID: PAYMENT-E2E-005 (ケース2-1-2)
     * 優先度: P0
     * カバー率寄与: 8%
     *
     * 前提条件:
     * - Stripe Connectアカウントが存在
     * - `payouts_enabled = false`（審査未完了）
     *
     * 期待結果:
     * - ゲスト管理ページで決済ボタンは表示される
     * - 決済ボタンをクリックするとエラートーストが表示される
     * - エラーメッセージ: "主催者のお支払い受付が一時的に制限されています。現金決済をご利用いただくか、主催者にお問い合わせください。"
     */

    console.log("=== ケース2-1-2: payouts_enabled = false の場合の決済不可 ===");

    // === 1. テストデータの作成 ===
    console.log("📝 テストデータ作成中...");

    await TestDataManager.createUserWithConnect();
    await TestDataManager.createPaidEvent();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // === 2. payouts_enabled を false に更新 ===
    // イベント作成者のユーザーIDを取得
    const { data: eventData, error: eventError } = await supabase
      .from("events")
      .select("created_by")
      .eq("id", TEST_IDS.EVENT_ID)
      .single();

    if (eventError || !eventData) {
      throw new Error("Failed to fetch event creator");
    }

    const testUserId = eventData.created_by;

    // payouts_enabled を false に設定（審査未完了状態をシミュレート）
    const { error: updateError } = await supabase
      .from("stripe_connect_accounts")
      .update({ payouts_enabled: false })
      .eq("user_id", testUserId);

    if (updateError) {
      throw new Error(`Failed to update payouts_enabled: ${updateError.message}`);
    }

    console.log("✓ payouts_enabled = false に設定完了（審査未完了状態）");

    // === 3. 参加者作成 ===
    const attendanceData = await TestDataManager.createAttendance({
      status: "attending",
    });

    console.log("✓ 参加者作成完了");

    // === 4. ゲストページにアクセス ===
    const guestPageUrl = `http://localhost:3000/guest/${attendanceData.guest_token}`;
    await page.goto(guestPageUrl);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    console.log("✓ ゲストページに遷移");

    // === 5. 決済ボタンが表示されていることを確認 ===
    const paymentButton = page.getByRole("button", { name: "決済を完了する" });
    await expect(paymentButton).toBeVisible();

    console.log("✓ 決済ボタンが表示されている");

    // === 6. 決済ボタンをクリックしてエラーが表示されることを確認 ===
    console.log("🔍 決済ボタンをクリックしてエラー確認");

    // ボタンをクリック
    await paymentButton.click();

    // エラートーストが表示されることを確認（タイムアウト時間を長めに設定）
    const errorToast = page.getByText(/主催者のお支払い受付が一時的に制限されています/i);
    await expect(errorToast).toBeVisible({ timeout: 5000 });

    console.log("✓ エラーメッセージが表示された（payouts_enabled = false）");

    console.log("🎉 ケース2-1-2: テスト成功（payouts_enabled = false の場合の決済不可）");
  });
});
