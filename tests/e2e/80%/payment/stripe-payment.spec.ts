/**
 * Stripe決済 ケース1-1: 初回決済フロー E2Eテスト
 *
 * 仕様書 docs/spec/test/e2e/stripe.md の「1-1. 初回決済フロー」に対応
 *
 * テストケース:
 * - ケース1-1-1: ゲストの初回Stripe決済成功フロー
 * - ケース1-1-2: オンライン支払い期限前の初回決済
 * - ケース1-1-3: Stripe Checkout Session の冪等性キー生成
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
 *
 * 参考:
 * - https://docs.stripe.com/automated-testing
 * - https://docs.stripe.com/stripe-cli
 */

import { test, expect } from "@playwright/test";

import {
  waitForPaymentStatus,
  getPaymentFromDB,
  getAttendanceFromDB,
} from "../../helpers/payment-helpers";
import { TestDataManager, TEST_IDS } from "../../helpers/test-data-setup";

test.describe("Stripe決済 ケース1-1: 初回決済フロー", () => {
  // 各テスト後のクリーンアップ
  test.afterEach(async () => {
    await TestDataManager.cleanup();
  });

  test("ケース1-1-1: ゲストの初回Stripe決済成功フロー", async ({ page }) => {
    /**
     * テストID: PAYMENT-E2E-001
     * 優先度: P0
     * カバー率寄与: 15%
     *
     * 前提条件:
     * - 有料イベント（参加費: 2000円）が存在
     * - Stripe Connectが設定済み（verified & payouts_enabled）
     * - ゲストが「参加」で登録済み
     *
     * 期待結果:
     * - `payments`テーブルに新規レコードが作成される
     * - `status = 'paid'`, `payment_method = 'stripe'`
     * - `stripe_checkout_session_id`, `stripe_payment_intent_id`が保存される
     * - `application_fee_amount`, `destination_account_id`が正しく設定される
     * - `checkout_idempotency_key`が生成され、`checkout_key_revision = 0`
     * - TODO: 決済完了通知メールが送信されることを確認（モック）
     */

    console.log("=== ケース1-1-1: ゲストの初回Stripe決済成功フロー ===");

    // === 1. テストデータの作成 ===
    console.log("📝 テストデータ作成中...");

    // ユーザー作成（Stripe Connect設定済み）
    await TestDataManager.createUserWithConnect();
    console.log("✓ ユーザー作成完了");

    // イベント作成（参加費: 2000円に変更）
    await TestDataManager.createPaidEvent();

    // イベントの参加費を2000円に更新
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 参加費を2000円に、オンライン支払い期限を未来に設定
    // 制約: payment_deadline >= registration_deadline を満たす必要がある
    const now = Date.now();
    const futureRegistrationDeadline = new Date(now + 12 * 60 * 60 * 1000).toISOString(); // +12時間
    const futurePaymentDeadline = new Date(now + 24 * 60 * 60 * 1000).toISOString(); // +1日

    const { error: updateError } = await supabase
      .from("events")
      .update({
        fee: 2000,
        registration_deadline: futureRegistrationDeadline,
        payment_deadline: futurePaymentDeadline,
        allow_payment_after_deadline: false,
      })
      .eq("id", TEST_IDS.EVENT_ID);

    if (updateError) {
      throw new Error(`Failed to update event fee: ${updateError.message}`);
    }

    console.log("✓ イベント作成完了（参加費: 2000円、オンライン支払い期限: +1日）");

    // 参加者作成（オンライン決済選択）
    const attendanceData = await TestDataManager.createAttendance({
      status: "attending",
    });
    console.log("✓ 参加者作成完了");

    // === 2. ゲストページにアクセス ===
    const guestPageUrl = `http://localhost:3000/guest/${attendanceData.guest_token}`;
    await page.goto(guestPageUrl);

    console.log("✓ ゲストページに遷移:", guestPageUrl);

    // ページが読み込まれるまで待機
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // === 3. 決済を開始 ===
    // 「オンライン決済へ進む」ボタンをクリック
    const paymentButton = page.getByRole("button", { name: "オンライン決済へ進む" });
    await expect(paymentButton).toBeVisible({ timeout: 5000 });

    await paymentButton.click();

    // Stripe Checkoutページへのリダイレクトを待つ
    await Promise.race([
      page.waitForURL(/checkout\.stripe\.com/, { timeout: 10000 }),
      page.waitForSelector('text="決済エラー"', { timeout: 10000 }).catch(() => null),
    ]);

    // エラーが表示されていないか確認
    const errorAlert = page.locator('text="決済エラー"');
    if (await errorAlert.isVisible()) {
      const errorText = await page.locator('div[role="alert"]').textContent();
      throw new Error(`Payment error: ${errorText}`);
    }

    // 現在のURLからCheckout Session IDを取得
    const currentUrl = page.url();
    console.log("✓ リダイレクト先URL:", currentUrl);

    let checkoutSessionId: string | undefined;

    if (currentUrl.includes("checkout.stripe.com")) {
      // Stripe CheckoutページのURLからセッションIDを抽出
      const match = currentUrl.match(/\/pay\/([^/?#]+)/);
      if (match?.[1]) {
        checkoutSessionId = match[1];
      }
    } else {
      // DBから最新のCheckout Session IDを取得
      const { data: payment, error: paymentError } = await supabase
        .from("payments")
        .select("stripe_checkout_session_id")
        .eq("attendance_id", TEST_IDS.ATTENDANCE_ID)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!paymentError && payment?.stripe_checkout_session_id) {
        checkoutSessionId = payment.stripe_checkout_session_id;
      }
    }

    if (!checkoutSessionId) {
      throw new Error("Failed to capture Checkout Session ID");
    }

    console.log("✓ Checkout Session ID:", checkoutSessionId);

    // === 4. DBからpayment_idを取得 ===
    const { data: paymentRecord, error: paymentFetchError } = await supabase
      .from("payments")
      .select("id")
      .eq("attendance_id", TEST_IDS.ATTENDANCE_ID)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (paymentFetchError || !paymentRecord?.id) {
      throw new Error("Failed to fetch payment_id from DB");
    }

    const paymentId = paymentRecord.id;
    console.log("✓ Payment ID:", paymentId);

    // === 5. Webhookで決済完了をシミュレート ===
    const { completeCheckoutSessionViaWebhook } = await import("../../helpers/payment-helpers");
    await completeCheckoutSessionViaWebhook(checkoutSessionId, TEST_IDS.ATTENDANCE_ID, paymentId);

    console.log("✓ 決済完了処理とWebhookトリガー完了");

    // Webhookが処理されるまで待機（SKIP_QSTASH_IN_TEST=true なので同期処理だが、念のため）
    await page.waitForTimeout(1000);

    // === 6. 決済ステータスの確認 ===
    console.log("⏳ 決済ステータス確認中...");

    const paymentCompleted = await waitForPaymentStatus(TEST_IDS.ATTENDANCE_ID, "paid", 20000);
    expect(paymentCompleted).toBe(true);

    console.log("✓ 決済ステータスが'paid'に更新");

    // === 7. 決済情報の詳細確認 ===
    const payment = await getPaymentFromDB(TEST_IDS.ATTENDANCE_ID);

    // 基本情報の検証
    expect(payment.status).toBe("paid");
    expect(payment.amount).toBe(2000); // 仕様書通り2000円
    expect(payment.method).toBe("stripe");

    // Stripe関連IDの検証
    expect(payment.stripe_payment_intent_id).toBeTruthy();
    expect(typeof payment.stripe_payment_intent_id).toBe("string");
    expect(payment.stripe_checkout_session_id).toBeTruthy();
    expect(payment.stripe_checkout_session_id).toBe(checkoutSessionId);

    // Destination charges関連の検証
    expect(payment.destination_account_id).toBeTruthy();
    expect(payment.destination_account_id).toBe(TEST_IDS.CONNECT_ACCOUNT_ID);
    // プラットフォーム手数料は4.9% (Stripe 3.6% + platform profit 1.3%)
    const expectedFee = Math.round(payment.amount * 0.049);
    expect(payment.application_fee_amount).toBe(expectedFee);
    expect(typeof payment.application_fee_amount).toBe("number");

    // 冪等性キーの検証
    expect(payment.checkout_idempotency_key).toBeTruthy();
    expect(typeof payment.checkout_idempotency_key).toBe("string");
    expect(payment.checkout_key_revision).toBe(0);

    // 決済日時の検証
    expect(payment.paid_at).toBeTruthy();
    expect(new Date(payment.paid_at as string).getTime()).toBeGreaterThan(0);

    console.log("✓ 決済情報の詳細確認完了:", {
      status: payment.status,
      amount: payment.amount,
      method: payment.method,
      payment_intent: payment.stripe_payment_intent_id
        ? payment.stripe_payment_intent_id.substring(0, 20) + "..."
        : "N/A",
      checkout_session: payment.stripe_checkout_session_id
        ? payment.stripe_checkout_session_id.substring(0, 20) + "..."
        : "N/A",
      destination_account: payment.destination_account_id,
      application_fee: payment.application_fee_amount,
      idempotency_key: payment.checkout_idempotency_key
        ? payment.checkout_idempotency_key.substring(0, 20) + "..."
        : "N/A",
      key_revision: payment.checkout_key_revision,
    });

    // === 8. 参加情報の確認 ===
    const attendanceInfo = await getAttendanceFromDB(TEST_IDS.ATTENDANCE_ID);
    expect(attendanceInfo.status).toBe("attending");

    console.log("✓ 参加ステータス確認完了");

    // TODO: 決済完了通知メールが送信されることを確認（モック）
    // メール送信機能が実装されたら、ここでメール送信のモックを検証する

    console.log("🎉 ケース1-1-1: テスト成功");
  });

  test("ケース1-1-2: オンライン支払い期限前の初回決済", async ({ page }) => {
    /**
     * テストID: PAYMENT-E2E-001 (ケース1-1-2)
     * 優先度: P0
     *
     * 前提条件:
     * - オンライン支払い期限（payment_deadline）が未来の日時
     * - 猶予期間設定なし（allow_payment_after_deadline = false）
     *
     * 期待結果:
     * - 決済ボタンが表示される
     * - 決済フローを開始できる
     * - 正常に決済が完了する
     */

    console.log("=== ケース1-1-2: オンライン支払い期限前の初回決済 ===");

    // === 1. テストデータの作成 ===
    console.log("📝 テストデータ作成中...");

    await TestDataManager.createUserWithConnect();
    await TestDataManager.createPaidEvent();

    // オンライン支払い期限を未来に設定（猶予期間なし）
    const futureDeadline = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(); // +2日
    await TestDataManager.updateEventPaymentSettings({
      payment_deadline: futureDeadline,
      allow_payment_after_deadline: false,
      grace_period_days: 0,
    });

    console.log("✓ オンライン支払い期限を未来に設定:", futureDeadline);

    const attendanceData = await TestDataManager.createAttendance({
      status: "attending",
    });

    console.log("✓ テストデータ作成完了");

    // === 2. ゲストページにアクセス ===
    const guestPageUrl = `http://localhost:3000/guest/${attendanceData.guest_token}`;
    await page.goto(guestPageUrl);

    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    console.log("✓ ゲストページに遷移");

    // === 3. 決済ボタンが表示されることを確認 ===
    const paymentButton = page.getByRole("button", { name: "オンライン決済へ進む" });
    await expect(paymentButton).toBeVisible({ timeout: 5000 });

    console.log("✓ 決済ボタンが表示されている");

    // === 4. 決済フローを開始 ===
    await paymentButton.click();

    // Stripe Checkoutページへのリダイレクトを待つ
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

    console.log("✓ 決済フローが正常に開始された");

    // === 5. Checkout Session IDを取得 ===
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select("id, stripe_checkout_session_id")
      .eq("attendance_id", TEST_IDS.ATTENDANCE_ID)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (paymentError || !payment?.stripe_checkout_session_id || !payment?.id) {
      throw new Error("Failed to get checkout session ID or payment ID from DB");
    }

    const checkoutSessionId = payment.stripe_checkout_session_id;
    const paymentId = payment.id;
    console.log("✓ Payment ID:", paymentId);

    // === 6. Webhookで決済完了をシミュレート ===
    const { completeCheckoutSessionViaWebhook } = await import("../../helpers/payment-helpers");
    await completeCheckoutSessionViaWebhook(checkoutSessionId, TEST_IDS.ATTENDANCE_ID, paymentId);

    await page.waitForTimeout(1000);

    // === 7. 決済が完了することを確認 ===
    const paymentCompleted = await waitForPaymentStatus(TEST_IDS.ATTENDANCE_ID, "paid", 20000);
    expect(paymentCompleted).toBe(true);

    console.log("✓ 決済が正常に完了");

    console.log("🎉 ケース1-1-2: テスト成功");
  });

  test("ケース1-1-3: Stripe Checkout Session の冪等性キー生成", async ({ page }) => {
    /**
     * テストID: PAYMENT-E2E-001 (ケース1-1-3)
     * 優先度: P0
     *
     * 前提条件:
     * - 初回決済
     *
     * 期待結果:
     * - `checkout_idempotency_key`が生成されることを確認
     * - `checkout_key_revision = 0`が設定されることを確認
     * - キーの形式が正しい（`checkout_`プレフィックス付き）
     */

    console.log("=== ケース1-1-3: 冪等性キー生成確認 ===");

    // === 1. テストデータの作成 ===
    console.log("📝 テストデータ作成中...");

    await TestDataManager.createUserWithConnect();
    await TestDataManager.createPaidEvent();

    const attendanceData = await TestDataManager.createAttendance({
      status: "attending",
    });

    console.log("✓ テストデータ作成完了");

    // === 2. 決済セッション作成APIを呼び出し ===
    const guestPageUrl = `http://localhost:3000/guest/${attendanceData.guest_token}`;
    await page.goto(guestPageUrl);

    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    console.log("✓ ゲストページに遷移");

    // 決済ボタンをクリック
    const paymentButton = page.getByRole("button", { name: "オンライン決済へ進む" });
    await expect(paymentButton).toBeVisible({ timeout: 5000 });
    await paymentButton.click();

    // リダイレクトを待つ
    await page.waitForTimeout(2000);

    // === 3. DBから決済レコードを取得 ===
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select("*")
      .eq("attendance_id", TEST_IDS.ATTENDANCE_ID)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (paymentError || !payment) {
      throw new Error("Failed to get payment record from DB");
    }

    console.log("✓ 決済レコード取得完了");

    // === 4. 冪等性キーの検証 ===
    // checkout_idempotency_key が生成されていることを確認
    expect(payment.checkout_idempotency_key).toBeTruthy();
    expect(typeof payment.checkout_idempotency_key).toBe("string");

    console.log("✓ checkout_idempotency_key が生成されている:", payment.checkout_idempotency_key);

    // checkout_key_revision = 0 であることを確認
    expect(payment.checkout_key_revision).toBe(0);

    console.log("✓ checkout_key_revision = 0");

    // キーの形式を確認（`checkout_`プレフィックス付き）
    const idempotencyKey = payment.checkout_idempotency_key as string;
    expect(idempotencyKey.startsWith("checkout_")).toBe(true);

    console.log("✓ 冪等性キーの形式が正しい（checkout_プレフィックス付き）");

    // UUIDまたはランダムな文字列が続くことを確認
    const keyParts = idempotencyKey.split("_");
    expect(keyParts.length).toBeGreaterThanOrEqual(2);
    expect(keyParts[1].length).toBeGreaterThan(0);

    console.log("✓ 冪等性キーが正しく生成されている:", {
      key: idempotencyKey.substring(0, 30) + "...",
      revision: payment.checkout_key_revision,
      prefix: "checkout_",
    });

    console.log("🎉 ケース1-1-3: テスト成功");
  });
});
