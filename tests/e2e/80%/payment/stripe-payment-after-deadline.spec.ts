/**
 * Stripe決済 ケース1-4: 期限後決済フロー E2Eテスト
 *
 * 仕様書 docs/spec/test/e2e/stripe.md の「1-4. 期限後決済フロー」に対応
 *
 * テストケース:
 * - ケース1-4-1: 決済締切後でも猶予期間内の決済（allow_payment_after_deadline = true）
 * - ケース1-4-2: 最終上限（eventDate + 30日）超過時の決済不可
 * - ケース1-4-3: 猶予期間OFF時の締切超過決済不可
 *
 * 前提条件:
 * - .env.test に SKIP_QSTASH_IN_TEST=true が設定されていること
 * - Stripe CLIがインストールされ、ログイン済みであること（`stripe login`）
 * - Stripe Test Modeが有効であること
 * - ローカルのSupabaseが起動していること
 *
 * 注意:
 * - Stripe CLIの`stripe listen`は不要です（テスト内でWebhookを直接トリガーします）
 * - SKIP_QSTASH_IN_TEST=true により、Webhookは同期的に処理されます
 * - 時刻操作はイベントの日時を調整することで行い、システム時刻はモックしません
 *
 * 参考:
 * - https://docs.stripe.com/automated-testing
 * - Stripe公式ベストプラクティス
 */

import { test, expect } from "@playwright/test";

import {
  waitForPaymentStatus,
  getPaymentFromDB,
  completeCheckoutSessionViaWebhook,
} from "../../helpers/payment-helpers";
import { TestDataManager, TEST_IDS } from "../../helpers/test-data-setup";

test.describe("Stripe決済 ケース1-4: 期限後決済フロー (PAYMENT-E2E-004)", () => {
  // 各テスト後のクリーンアップ
  test.afterEach(async () => {
    await TestDataManager.cleanup();
  });

  test("ケース1-4-1: 猶予期間内の決済成功", async ({ page }) => {
    /**
     * テストID: PAYMENT-E2E-004 (ケース1-4-1)
     * 優先度: P0
     * カバー率寄与: 12%
     *
     * 前提条件:
     * - 決済締切（payment_deadline）が過去の日時（現在 - 3日）
     * - `allow_payment_after_deadline = true`
     * - `grace_period_days = 7`
     * - 現在時刻が payment_deadline + 3日（猶予期間7日以内）
     *
     * 期待結果:
     * - ゲスト管理ページで決済ボタンが表示される
     * - 決済フローを開始できる
     * - 猶予期間内なので決済が成功する
     */

    console.log("=== ケース1-4-1: 猶予期間内の決済成功 ===");

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

    // === 2. 期限後決済状態を作成 ===
    // 実際の現在時刻を基準にして日時を設定（バリデーションは現在時刻で行われるため）
    // 決済締切を3日前に設定（現在時刻 = 締切 + 3日、猶予期間7日以内）
    const now = Date.now();
    const paymentDeadline = new Date(now - 3 * 24 * 60 * 60 * 1000); // 3日前
    const eventDate = new Date(now + 4 * 24 * 60 * 60 * 1000); // 4日後（未来）
    const registrationDeadline = new Date(now - 4 * 24 * 60 * 60 * 1000); // 4日前
    const createdAt = new Date(now - 5 * 24 * 60 * 60 * 1000); // 5日前（全ての日時より前）

    const { error: updateError } = await supabase
      .from("events")
      .update({
        fee: 3000,
        date: eventDate.toISOString(),
        registration_deadline: registrationDeadline.toISOString(),
        payment_deadline: paymentDeadline.toISOString(),
        allow_payment_after_deadline: true,
        grace_period_days: 7,
        created_at: createdAt.toISOString(), // DB制約を満たすため、created_atも更新
        updated_at: new Date().toISOString(),
      })
      .eq("id", TEST_IDS.EVENT_ID);

    if (updateError) {
      throw new Error(`Failed to update event: ${updateError.message}`);
    }

    console.log("✓ イベント設定完了:", {
      fee: "3000円",
      payment_deadline: "3日前（過去）",
      allow_payment_after_deadline: true,
      grace_period_days: 7,
      eventDate: "4日後（未来）",
      status: "猶予期間内（締切+3日 < 締切+7日）",
    });

    // 参加者作成
    const attendanceData = await TestDataManager.createAttendance({
      status: "attending",
    });

    console.log("✓ 参加者作成完了");

    // === 3. ゲストページにアクセス ===
    const guestPageUrl = `http://localhost:3000/guest/${attendanceData.guest_token}`;
    await page.goto(guestPageUrl);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    console.log("✓ ゲストページに遷移");

    // === 4. 決済ボタンが表示されることを確認 ===
    const paymentButton = page.getByRole("button", { name: "決済を完了する" });
    await expect(paymentButton).toBeVisible({ timeout: 5000 });

    console.log("✓ 決済ボタンが表示されている（猶予期間内）");

    // === 5. 決済セッション作成 ===
    await paymentButton.click();

    // Stripe Checkoutページへのリダイレクトまたはエラー表示を待つ
    await Promise.race([
      page.waitForURL(/checkout\.stripe\.com/, { timeout: 10000 }),
      page.waitForSelector('text="決済エラー"', { timeout: 10000 }).catch(() => null),
    ]);

    // エラーが表示されていないことを確認
    const errorAlert = page.locator('text="決済エラー"');
    if (await errorAlert.isVisible()) {
      const errorText = await page.locator('div[role="alert"]').textContent();
      throw new Error(`Payment error: ${errorText}`);
    }

    console.log("✓ 決済セッション作成完了");

    // === 6. DBから決済情報を取得 ===
    const { data: payment, error: paymentFetchError } = await supabase
      .from("payments")
      .select("*")
      .eq("attendance_id", TEST_IDS.ATTENDANCE_ID)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (paymentFetchError || !payment) {
      throw new Error("Failed to fetch payment from DB");
    }

    const paymentId = payment.id;
    const checkoutSessionId = payment.stripe_checkout_session_id;

    console.log("✓ 決済情報取得:", {
      payment_id: paymentId,
      status: payment.status,
      amount: payment.amount,
    });

    // === 7. 決済完了をシミュレート ===
    console.log("⚡ 決済完了イベントをトリガー中...");

    await completeCheckoutSessionViaWebhook(
      checkoutSessionId as string,
      TEST_IDS.ATTENDANCE_ID,
      paymentId
    );

    await page.waitForTimeout(1000);

    // === 8. 決済完了状態の確認 ===
    const paymentCompleted = await waitForPaymentStatus(TEST_IDS.ATTENDANCE_ID, "paid", 20000);
    expect(paymentCompleted).toBe(true);

    console.log("✓ 決済が正常に完了（status = 'paid'）");

    // === 9. 最終的な決済情報の確認 ===
    const finalPayment = await getPaymentFromDB(TEST_IDS.ATTENDANCE_ID);

    expect(finalPayment.status).toBe("paid");
    expect(finalPayment.amount).toBe(3000);
    expect(finalPayment.method).toBe("stripe");
    expect(finalPayment.stripe_payment_intent_id).toBeTruthy();
    expect(finalPayment.stripe_checkout_session_id).toBe(checkoutSessionId);

    console.log("✓ 最終的な決済情報確認完了");

    console.log("🎉 ケース1-4-1: テスト成功（猶予期間内の決済成功）");
  });

  test("ケース1-4-2: 最終上限（eventDate + 30日）超過時の決済不可", async ({ page }) => {
    /**
     * テストID: PAYMENT-E2E-004 (ケース1-4-2)
     * 優先度: P0
     * カバー率寄与: 12%
     *
     * 前提条件:
     * - イベント開催日が過去（現在 - 32日）
     * - 決済締切が過去（現在 - 33日）
     * - `allow_payment_after_deadline = true`
     * - `grace_period_days = 30`
     * - 最終支払期限 = min(payment_deadline + 30日, eventDate + 30日)
     *   = min(現在 - 3日, 現在 - 2日) = 現在 - 3日（過去）
     * - 現在時刻が最終支払期限を超過している
     *
     * 期待結果:
     * - 決済ボタンが表示されるがdisabled状態
     * - 期限超過メッセージが表示される
     * - エラーメッセージ: "決済期限を過ぎているため、現在このイベントでは決済できません。"
     */

    console.log("=== ケース1-4-2: 最終上限超過時の決済不可 ===");

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

    // === 2. 最終上限超過状態を作成 ===
    // 実際の現在時刻を基準にして日時を設定（バリデーションは現在時刻で行われるため）
    // イベント日を32日前に設定（eventDate + 30日 = 現在 - 2日 < 現在）
    // 注: イベント日が過去なので、created_atもeventDateより前に設定する必要がある（DB制約対応）
    const now = Date.now();
    const eventDate = new Date(now - 32 * 24 * 60 * 60 * 1000); // 32日前
    const paymentDeadline = new Date(now - 33 * 24 * 60 * 60 * 1000); // 33日前
    const registrationDeadline = new Date(now - 34 * 24 * 60 * 60 * 1000); // 34日前
    const createdAt = new Date(now - 40 * 24 * 60 * 60 * 1000); // 40日前（全ての日時より前）

    const { error: updateError } = await supabase
      .from("events")
      .update({
        fee: 3000,
        date: eventDate.toISOString(),
        registration_deadline: registrationDeadline.toISOString(),
        payment_deadline: paymentDeadline.toISOString(),
        allow_payment_after_deadline: true,
        grace_period_days: 30,
        created_at: createdAt.toISOString(), // DB制約を満たすため、created_atもeventDateより前に設定
        updated_at: new Date().toISOString(),
      })
      .eq("id", TEST_IDS.EVENT_ID);

    if (updateError) {
      throw new Error(`Failed to update event: ${updateError.message}`);
    }

    console.log("✓ イベント設定完了:", {
      fee: "3000円",
      eventDate: "32日前（過去）",
      payment_deadline: "33日前（過去）",
      allow_payment_after_deadline: true,
      grace_period_days: 30,
      status: "最終支払期限（min(payment_deadline + 30d, eventDate + 30d) = 3日前）を超過",
    });

    // 参加者作成
    const attendanceData = await TestDataManager.createAttendance({
      status: "attending",
    });

    console.log("✓ 参加者作成完了");

    // === 3. ゲストページにアクセス ===
    const guestPageUrl = `http://localhost:3000/guest/${attendanceData.guest_token}`;
    await page.goto(guestPageUrl);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    console.log("✓ ゲストページに遷移");

    // === 4. 決済ボタンがdisabled状態になることを確認 ===
    const paymentButton = page.getByRole("button", { name: "決済を完了する" });

    // ボタンは表示されているが、disabled状態であることを確認
    await expect(paymentButton).toBeVisible({ timeout: 5000 });
    await expect(paymentButton).toBeDisabled();

    console.log("✓ 決済ボタンが無効化されている（最終上限超過）");

    // === 5. 期限超過メッセージの確認 ===
    // エラーメッセージが表示されることを確認
    const errorMessage = page.locator(
      'text="決済期限を過ぎているため、現在このイベントでは決済できません。"'
    );
    await expect(errorMessage).toBeVisible({ timeout: 5000 });

    console.log("✓ 期限超過メッセージが表示されている");

    console.log("🎉 ケース1-4-2: テスト成功（最終上限超過時の決済不可）");
  });

  test("ケース1-4-3: 猶予期間OFF時の締切超過決済不可", async ({ page }) => {
    /**
     * テストID: PAYMENT-E2E-004 (ケース1-4-3)
     * 優先度: P0
     * カバー率寄与: 12%
     *
     * 前提条件:
     * - `allow_payment_after_deadline = false`（猶予期間なし）
     * - 決済締切が過去（現在 - 1日）
     * - `grace_period_days = 0`
     * - 最終支払期限 = payment_deadline（猶予期間なしのため）= 現在 - 1日（過去）
     * - 現在時刻が最終支払期限を超過している
     *
     * 期待結果:
     * - 決済ボタンが表示されるがdisabled状態
     * - 期限超過メッセージが表示される
     * - エラーメッセージ: "決済期限を過ぎているため、現在このイベントでは決済できません。"
     */

    console.log("=== ケース1-4-3: 猶予期間OFF時の締切超過決済不可 ===");

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

    // === 2. 締切超過状態を作成（猶予期間OFF） ===
    // 実際の現在時刻を基準にして日時を設定（バリデーションは現在時刻で行われるため）
    const now = Date.now();
    const paymentDeadline = new Date(now - 1 * 24 * 60 * 60 * 1000); // 1日前（過去）
    const eventDate = new Date(now + 7 * 24 * 60 * 60 * 1000); // 7日後（未来）
    const registrationDeadline = new Date(now - 2 * 24 * 60 * 60 * 1000); // 2日前
    const createdAt = new Date(now - 3 * 24 * 60 * 60 * 1000); // 3日前（全ての日時より前）

    const { error: updateError } = await supabase
      .from("events")
      .update({
        fee: 3000,
        date: eventDate.toISOString(),
        registration_deadline: registrationDeadline.toISOString(),
        payment_deadline: paymentDeadline.toISOString(),
        allow_payment_after_deadline: false, // 猶予期間OFF
        grace_period_days: 0,
        created_at: createdAt.toISOString(), // DB制約を満たすため、created_atも更新
        updated_at: new Date().toISOString(),
      })
      .eq("id", TEST_IDS.EVENT_ID);

    if (updateError) {
      throw new Error(`Failed to update event: ${updateError.message}`);
    }

    console.log("✓ イベント設定完了:", {
      fee: "3000円",
      payment_deadline: "1日前（過去）",
      allow_payment_after_deadline: false,
      grace_period_days: 0,
      eventDate: "7日後（未来）",
      status: "最終支払期限（payment_deadline = 1日前）を超過（猶予期間なし）",
    });

    // 参加者作成
    const attendanceData = await TestDataManager.createAttendance({
      status: "attending",
    });

    console.log("✓ 参加者作成完了");

    // === 3. ゲストページにアクセス ===
    const guestPageUrl = `http://localhost:3000/guest/${attendanceData.guest_token}`;
    await page.goto(guestPageUrl);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    console.log("✓ ゲストページに遷移");

    // === 4. 決済ボタンがdisabled状態になることを確認 ===
    const paymentButton = page.getByRole("button", { name: "決済を完了する" });

    // ボタンは表示されているが、disabled状態であることを確認
    await expect(paymentButton).toBeVisible({ timeout: 5000 });
    await expect(paymentButton).toBeDisabled();

    console.log("✓ 決済ボタンが無効化されている（猶予期間OFF、締切超過）");

    // === 5. 期限超過メッセージの確認 ===
    // エラーメッセージが表示されることを確認
    const errorMessage = page.locator(
      'text="決済期限を過ぎているため、現在このイベントでは決済できません。"'
    );
    await expect(errorMessage).toBeVisible({ timeout: 5000 });

    console.log("✓ 期限超過メッセージが表示されている");

    console.log("🎉 ケース1-4-3: テスト成功（猶予期間OFF時の決済不可）");
  });
});
