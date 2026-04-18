/**
 * Stripe決済 ケース2-1: Stripe Connect関連エラー E2Eテスト
 *
 * 仕様書 docs/spec/test/e2e/stripe.md の「2-1. Stripe Connect関連エラー」に対応
 *
 * テストケース:
 * - ケース2-1-1: Connect未設定時の決済不可
 * - ケース2-1-2: payout_profile.status = onboarding の場合の決済不可
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
     * - イベントが payout_profile を持たない
     *
     * 期待結果:
     * - ゲスト管理ページでオンライン決済ボタンは表示される
     * - 決済ボタンをクリックするとエラートーストが表示される
     * - エラーメッセージ: "オンライン決済の準備ができていません。現金決済をご利用いただくか、しばらく時間をおいて再度お試しください。"
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

    // === 2. event から payout profile snapshot を外す ===
    await TestDataManager.setEventPayoutProfile(null);

    const { data: eventData, error: eventError } = await supabase
      .from("events")
      .select("payout_profile_id")
      .eq("id", TEST_IDS.EVENT_ID)
      .single();

    if (eventError || !eventData) {
      throw new Error("Failed to fetch event payout state");
    }

    expect(eventData.payout_profile_id).toBeNull();

    console.log("✓ event の payout_profile_id を解除完了（Connect未設定相当）");

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
    const paymentButton = page.getByRole("button", { name: "オンライン決済へ進む" });
    await expect(paymentButton).toBeVisible();

    console.log("✓ 決済ボタンが表示されている");

    // === 6. 決済ボタンをクリックしてエラーが表示されることを確認 ===
    console.log("🔍 決済ボタンをクリックしてエラー確認");

    // ボタンをクリック
    await paymentButton.click();

    // エラートーストが表示されることを確認（タイムアウト時間を長めに設定）
    const errorToast = page.getByText(
      /オンライン決済の準備ができていません.*現金決済をご利用いただくか.*再度お試しください/i
    );
    await expect(errorToast).toBeVisible({ timeout: 5000 });

    console.log("✓ エラーメッセージが表示された（Connect未設定）");

    console.log("🎉 ケース2-1-1: テスト成功（Connect未設定時の決済不可）");
  });

  test("ケース2-1-2: payout_profile.status = onboarding の場合の決済不可", async ({ page }) => {
    /**
     * テストID: PAYMENT-E2E-005 (ケース2-1-2)
     * 優先度: P0
     * カバー率寄与: 8%
     *
     * 前提条件:
     * - payout_profile が存在する
     * - payout_profile.status = onboarding（審査未完了）
     *
     * 期待結果:
     * - ゲスト管理ページでオンライン決済ボタンは表示される
     * - 決済ボタンをクリックするとエラートーストが表示される
     * - エラーメッセージ: "現在オンライン決済がご利用いただけません。現金決済をご利用いただくか、しばらく時間をおいて再度お試しください。"
     */

    console.log("=== ケース2-1-2: payout_profile.status = onboarding の場合の決済不可 ===");

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

    // === 2. payout_profile を審査未完了状態に更新 ===
    await TestDataManager.setCurrentPayoutProfileState({
      status: "onboarding",
      payoutsEnabled: true,
      chargesEnabled: true,
    });

    const { data: eventData, error: eventError } = await supabase
      .from("events")
      .select("payout_profile_id")
      .eq("id", TEST_IDS.EVENT_ID)
      .single();

    if (eventError || !eventData?.payout_profile_id) {
      throw new Error("Failed to fetch event payout profile");
    }

    const { data: payoutProfile, error: payoutProfileError } = await supabase
      .from("payout_profiles")
      .select("status")
      .eq("id", eventData.payout_profile_id)
      .single();

    if (payoutProfileError || !payoutProfile) {
      throw new Error("Failed to fetch payout profile state");
    }

    expect(payoutProfile.status).toBe("onboarding");

    console.log("✓ payout_profile を onboarding に設定完了（審査未完了状態）");

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
    const paymentButton = page.getByRole("button", { name: "オンライン決済へ進む" });
    await expect(paymentButton).toBeVisible();

    console.log("✓ 決済ボタンが表示されている");

    // === 6. 決済ボタンをクリックしてエラーが表示されることを確認 ===
    console.log("🔍 決済ボタンをクリックしてエラー確認");

    // ボタンをクリック
    await paymentButton.click();

    // エラートーストが表示されることを確認（タイムアウト時間を長めに設定）
    const errorToast = page.getByText(
      /現在オンライン決済がご利用いただけません.*現金決済をご利用いただくか.*再度お試しください/i
    );
    await expect(errorToast).toBeVisible({ timeout: 5000 });

    console.log("✓ エラーメッセージが表示された（payout_profile.status = onboarding）");

    console.log(
      "🎉 ケース2-1-2: テスト成功（payout_profile.status = onboarding の場合の決済不可）"
    );
  });
});
