/**
 * Stripe決済 ケース2-3: イベントステータスによる制御 E2Eテスト
 *
 * 仕様書 docs/spec/test/e2e/stripe.md の「2-3. イベントステータスによる制御」に対応
 *
 * テストケース:
 * - ケース2-3-1: キャンセル済みイベントの決済不可
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

test.describe("Stripe決済 ケース2-3: イベントステータスによる制御 (PAYMENT-E2E-007)", () => {
  // 各テスト後のクリーンアップ
  test.afterEach(async () => {
    await TestDataManager.cleanup();
  });

  test("ケース2-3-1: キャンセル済みイベントの決済不可", async ({ page }) => {
    /**
     * テストID: PAYMENT-E2E-007 (ケース2-3-1)
     * 優先度: P0
     * カバー率寄与: 5%
     *
     * 前提条件:
     * - event.canceled_at != null（イベントがキャンセル済み）
     *
     * 期待結果:
     * - 決済ボタンが表示される（フロントエンドでは表示）
     * - 決済ボタンをクリックするとエラートーストが表示される
     * - エラーメッセージ: "キャンセル済みまたは無効な状態のイベントです"
     */

    console.log("=== ケース2-3-1: キャンセル済みイベントの決済不可 ===");

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

    console.log("✓ ユーザー・Connect・イベント作成完了");

    // === 2. イベントをキャンセル済みに更新 ===
    const canceledAt = new Date().toISOString();

    // イベント作成者のユーザーIDを取得
    const { data: eventData, error: eventError } = await supabase
      .from("events")
      .select("created_by")
      .eq("id", TEST_IDS.EVENT_ID)
      .single();

    if (eventError || !eventData) {
      throw new Error("Failed to fetch event creator");
    }

    const { error: updateError } = await supabase
      .from("events")
      .update({
        canceled_at: canceledAt,
        canceled_by: eventData.created_by,
        invite_token: null, // キャンセル時は招待トークンも無効化
      })
      .eq("id", TEST_IDS.EVENT_ID);

    if (updateError) {
      throw new Error(`Failed to cancel event: ${updateError.message}`);
    }

    console.log("✓ イベントをキャンセル済みに更新完了");

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

    // === 5. 決済ボタンが表示されることを確認（UI上は表示される） ===
    // 注: フロントエンドでは canceled_at の状態を直接取得しないため、
    // ボタンは表示されるが、クリック時にバックエンドでエラーが返る設計
    const paymentButton = page.getByRole("button", { name: /決済を完了する/ });
    await expect(paymentButton).toBeVisible({ timeout: 5000 });

    console.log("✓ 決済ボタンが表示されている（フロントエンド表示）");

    // === 6. 決済ボタンをクリック ===
    console.log("🔍 決済ボタンをクリックしてエラー確認");

    await paymentButton.click();

    // === 7. エラートーストまたはアラートが表示されることを確認 ===
    // バックエンドでイベントのキャンセル状態をチェックし、エラーを返す
    // エラーメッセージ: "キャンセル済みまたは無効な状態のイベントです。"
    const errorMessage = page.locator("text=/キャンセル済み.*無効な状態/i");
    await expect(errorMessage).toBeVisible({ timeout: 5000 });

    console.log("✓ エラーメッセージが表示された（キャンセル済みイベント）");

    // === 8. Stripe Checkoutページに遷移していないことを確認 ===
    await page.waitForTimeout(1000);
    const currentUrl = page.url();
    expect(currentUrl).not.toContain("checkout.stripe.com");

    console.log("✓ Stripe Checkoutページに遷移していない");

    console.log("🎉 ケース2-3-1: テスト成功（キャンセル済みイベントの決済不可）");
  });

  test("ケース2-3-2: キャンセル前に決済済みの場合、決済完了状態が維持される", async ({ page }) => {
    /**
     * テストID: PAYMENT-E2E-007 (ケース2-3-2)
     * 優先度: P1
     * カバー率寄与: 3%
     *
     * 前提条件:
     * - 決済完了後にイベントがキャンセルされた
     *
     * 期待結果:
     * - 決済済み状態が維持される
     * - 決済ボタンは非表示
     * - 「決済完了」バッジが表示される
     */

    console.log("=== ケース2-3-2: キャンセル前決済済みの状態維持 ===");

    // === 1. テストデータの作成 ===
    console.log("📝 テストデータ作成中...");

    await TestDataManager.createUserWithConnect();
    await TestDataManager.createPaidEvent();

    console.log("✓ ユーザー・Connect・イベント作成完了");

    // === 2. 決済済み状態の参加者を作成 ===
    const attendanceData = await TestDataManager.createAttendance({
      status: "attending",
      existingPayment: {
        amount: 3000,
        status: "paid",
      },
    });

    console.log("✓ 参加者作成完了（決済済み状態）");

    // === 3. イベントをキャンセル済みに更新 ===
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const canceledAt = new Date().toISOString();

    const { data: eventData, error: eventError } = await supabase
      .from("events")
      .select("created_by")
      .eq("id", TEST_IDS.EVENT_ID)
      .single();

    if (eventError || !eventData) {
      throw new Error("Failed to fetch event creator");
    }

    const { error: updateError } = await supabase
      .from("events")
      .update({
        canceled_at: canceledAt,
        canceled_by: eventData.created_by,
        invite_token: null,
      })
      .eq("id", TEST_IDS.EVENT_ID);

    if (updateError) {
      throw new Error(`Failed to cancel event: ${updateError.message}`);
    }

    console.log("✓ イベントをキャンセル済みに更新完了");

    // === 4. ゲストページにアクセス ===
    const guestPageUrl = `http://localhost:3000/guest/${attendanceData.guest_token}`;
    await page.goto(guestPageUrl);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    console.log("✓ ゲストページに遷移");

    // === 5. 決済ボタンが非表示であることを確認 ===
    const paymentButton = page.getByRole("button", { name: /決済を完了する/ });
    await expect(paymentButton).not.toBeVisible({ timeout: 3000 });

    console.log("✓ 決済ボタンが非表示であることを確認");

    // === 6. 「決済完了」テキストが表示されることを確認 ===
    const paymentStatusText = page.locator('text="決済完了"');
    await expect(paymentStatusText).toBeVisible({ timeout: 5000 });

    console.log("✓ 「決済完了」ステータスが表示されている");

    // === 7. イベントがキャンセルされたことの表示を確認（オプション） ===
    // 注: UIでキャンセル通知が表示される場合は確認
    // const canceledNotice = page.getByText(/キャンセル|中止/i);
    // if (await canceledNotice.isVisible()) {
    //   console.log("✓ イベントキャンセル通知が表示されている");
    // }

    console.log("🎉 ケース2-3-2: テスト成功（キャンセル前決済済みの状態維持）");
  });
});
