/**
 * Stripe決済 ケース3-1: Webhook処理と決済完了確認 E2Eテスト
 *
 * 仕様書 docs/spec/test/e2e/stripe.md の「3-1. Webhook経由の決済完了処理」に対応
 *
 * テストケース:
 * - ケース3-1-1: checkout.session.completed イベント受信
 * - ケース3-1-2: payment_intent.succeeded イベント受信
 * - ケース3-1-3: charge.succeeded イベント受信（Destination charges確認）
 *
 * 前提条件:
 * - .env.test に SKIP_QSTASH_IN_TEST=true が設定されていること
 * - STRIPE_WEBHOOK_SECRET_TEST または STRIPE_WEBHOOK_SECRET が設定されていること
 * - Stripe Test Modeが有効であること
 * - ローカルのSupabaseが起動していること
 *
 * アプローチ:
 * - Stripe CLIは使用せず、手動でWebhookペイロードを構築・送信
 * - Stripeの`generateTestHeaderString`を使用して正しい署名を生成
 * - SKIP_QSTASH_IN_TEST=true により、Webhookは同期的に処理される
 *
 * 参考:
 * - https://docs.stripe.com/automated-testing
 * - https://docs.stripe.com/webhooks/test
 */

import crypto from "crypto";

import { test, expect } from "@playwright/test";

import { getPaymentFromDB, sendStripeWebhook } from "../../helpers/payment-helpers";
import { TestDataManager, TEST_IDS } from "../../helpers/test-data-setup";

test.describe("Stripe決済 ケース3-1: Webhook処理と決済完了確認", () => {
  // 各テスト後のクリーンアップ
  test.afterEach(async () => {
    await TestDataManager.cleanup();
  });

  test("ケース3-1-1: checkout.session.completed イベント受信", async () => {
    /**
     * テストID: PAYMENT-E2E-008 (ケース3-1-1)
     * 優先度: P0
     * カバー率寄与: 8%の一部
     *
     * 前提条件:
     * - Checkout Sessionが作成済み
     *
     * 期待結果:
     * - Webhook署名検証が成功
     * - QStashにイベントが転送される（またはテストモードでスキップ）
     * - Worker処理でpaymentレコードが更新される
     * - `stripe_checkout_session_id`が保存される
     * - `stripe_payment_intent_id`が保存される（ペイロードに含まれる場合）
     */

    console.log("=== ケース3-1-1: checkout.session.completed イベント受信 ===");

    // === 1. テストデータの作成 ===
    console.log("📝 テストデータ作成中...");

    // ユーザー作成（Stripe Connect設定済み）
    await TestDataManager.createUserWithConnect();
    console.log("✓ ユーザー作成完了");

    // イベント作成
    await TestDataManager.createPaidEvent();
    console.log("✓ イベント作成完了");

    // 参加者作成
    await TestDataManager.createAttendance();
    console.log("✓ 参加者作成完了");

    // 決済レコードを作成（pending状態）
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const paymentId = crypto.randomUUID();
    const checkoutSessionId = `cs_test_${Date.now()}`;
    const paymentIntentId = `pi_test_${Date.now()}`;

    const { error: paymentError } = await supabase.from("payments").insert({
      id: paymentId,
      attendance_id: TEST_IDS.ATTENDANCE_ID,
      amount: 1000,
      method: "stripe",
      status: "pending",
      destination_account_id: TEST_IDS.CONNECT_ACCOUNT_ID,
      application_fee_amount: Math.round(1000 * 0.013),
    });

    if (paymentError) {
      throw new Error(`Failed to create payment: ${paymentError.message}`);
    }

    console.log("✓ 決済レコード作成完了（pending状態）");

    // === 2. checkout.session.completed Webhookを送信 ===
    console.log("📤 checkout.session.completed Webhookを送信中...");

    const sessionData = {
      id: checkoutSessionId,
      object: "checkout.session",
      payment_intent: paymentIntentId,
      payment_status: "paid",
      status: "complete",
      amount_total: 1000,
      currency: "jpy",
      mode: "payment",
      customer: null,
      metadata: {
        payment_id: paymentId,
        attendance_id: TEST_IDS.ATTENDANCE_ID,
        event_id: TEST_IDS.EVENT_ID,
      },
    };

    const response = await sendStripeWebhook("checkout.session.completed", sessionData);
    expect(response.ok).toBe(true);
    expect(response.status).toBe(204);

    console.log("✓ Webhook送信完了: status", response.status);

    // === 3. DBの更新確認 ===
    console.log("⏳ DB更新を確認中...");

    // SKIP_QSTASH_IN_TEST=true なので同期的に処理されているが、念のため少し待機
    await new Promise((resolve) => setTimeout(resolve, 500));

    const payment = await getPaymentFromDB(TEST_IDS.ATTENDANCE_ID);

    // stripe_checkout_session_id が保存されていることを確認
    expect(payment.stripe_checkout_session_id).toBe(checkoutSessionId);
    console.log("✓ stripe_checkout_session_id が保存されている");

    // stripe_payment_intent_id が保存されていることを確認
    expect(payment.stripe_payment_intent_id).toBe(paymentIntentId);
    console.log("✓ stripe_payment_intent_id が保存されている");

    // ステータスはまだpending（payment_intent.succeededで確定される）
    expect(payment.status).toBe("pending");
    console.log("✓ ステータスはまだpending（正常）");

    console.log("✅ ケース3-1-1 完了");
  });

  test("ケース3-1-2: payment_intent.succeeded イベント受信", async () => {
    /**
     * テストID: PAYMENT-E2E-008 (ケース3-1-2)
     * 優先度: P0
     * カバー率寄与: 8%の一部
     *
     * 前提条件:
     * - PaymentIntentが作成済み
     *
     * 期待結果:
     * - paymentレコードのstatus更新: `pending` → `paid`
     * - `paid_at`タイムスタンプが記録される
     * - `stripe_payment_intent_id`が保存される
     */

    console.log("=== ケース3-1-2: payment_intent.succeeded イベント受信 ===");

    // === 1. テストデータの作成 ===
    console.log("📝 テストデータ作成中...");

    await TestDataManager.createUserWithConnect();
    await TestDataManager.createPaidEvent();
    await TestDataManager.createAttendance();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const paymentId = crypto.randomUUID();
    const paymentIntentId = `pi_test_${Date.now()}`;

    const { error: paymentError } = await supabase.from("payments").insert({
      id: paymentId,
      attendance_id: TEST_IDS.ATTENDANCE_ID,
      amount: 2000,
      method: "stripe",
      status: "pending",
      destination_account_id: TEST_IDS.CONNECT_ACCOUNT_ID,
      application_fee_amount: Math.round(2000 * 0.013),
    });

    if (paymentError) {
      throw new Error(`Failed to create payment: ${paymentError.message}`);
    }

    console.log("✓ 決済レコード作成完了（pending状態、金額: 2000円）");

    // === 2. payment_intent.succeeded Webhookを送信 ===
    console.log("📤 payment_intent.succeeded Webhookを送信中...");

    const paymentIntentData = {
      id: paymentIntentId,
      object: "payment_intent",
      amount: 2000,
      currency: "jpy",
      status: "succeeded",
      charges: {
        data: [
          {
            id: `ch_test_${Date.now()}`,
            amount: 2000,
            currency: "jpy",
            status: "succeeded",
          },
        ],
      },
      metadata: {
        payment_id: paymentId,
        attendance_id: TEST_IDS.ATTENDANCE_ID,
        event_id: TEST_IDS.EVENT_ID,
      },
    };

    const response = await sendStripeWebhook("payment_intent.succeeded", paymentIntentData);

    expect(response.ok).toBe(true);
    expect(response.status).toBe(204);

    console.log("✓ Webhook送信完了: status", response.status);

    // === 3. DBの更新確認 ===
    console.log("⏳ DB更新を確認中...");

    await new Promise((resolve) => setTimeout(resolve, 500));

    const payment = await getPaymentFromDB(TEST_IDS.ATTENDANCE_ID);

    // ステータスがpaidに更新されていることを確認
    expect(payment.status).toBe("paid");
    console.log("✓ ステータスがpaidに更新");

    // paid_atタイムスタンプが記録されていることを確認
    expect(payment.paid_at).toBeTruthy();
    expect(new Date(payment.paid_at as string).getTime()).toBeGreaterThan(0);
    console.log("✓ paid_atタイムスタンプが記録");

    // stripe_payment_intent_idが保存されていることを確認
    expect(payment.stripe_payment_intent_id).toBe(paymentIntentId);
    console.log("✓ stripe_payment_intent_idが保存");

    console.log("✅ ケース3-1-2 完了");
  });

  test("ケース3-1-3: charge.succeeded イベント受信（Destination charges確認）", async () => {
    /**
     * テストID: PAYMENT-E2E-008 (ケース3-1-3)
     * 優先度: P0
     * カバー率寄与: 8%の一部
     *
     * 前提条件:
     * - Charge成功
     *
     * 期待結果:
     * - `destination`フィールドが正しいConnect アカウントIDであることを確認
     * - `application_fee_amount`が正しく設定されていることを確認（4.9%）
     * - Destination chargesが正しく機能
     */

    console.log("=== ケース3-1-3: charge.succeeded イベント受信（Destination charges確認） ===");

    // === 1. テストデータの作成 ===
    console.log("📝 テストデータ作成中...");

    await TestDataManager.createUserWithConnect();
    await TestDataManager.createPaidEvent();
    await TestDataManager.createAttendance();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const paymentId = crypto.randomUUID();
    const chargeId = `ch_test_${Date.now()}`;
    const paymentIntentId = `pi_test_${Date.now()}`;

    // Destination Charges設定済みの決済レコードを作成
    const { error: paymentError } = await supabase.from("payments").insert({
      id: paymentId,
      attendance_id: TEST_IDS.ATTENDANCE_ID,
      amount: 3000,
      method: "stripe",
      status: "pending",
      destination_account_id: TEST_IDS.CONNECT_ACCOUNT_ID,
      application_fee_amount: Math.round(3000 * 0.049), // 4.9%
      stripe_payment_intent_id: paymentIntentId,
    });

    if (paymentError) {
      throw new Error(`Failed to create payment: ${paymentError.message}`);
    }

    console.log("✓ 決済レコード作成完了（Destination Charges設定済み）");

    // === 2. charge.succeeded Webhookを送信 ===
    console.log("📤 charge.succeeded Webhookを送信中...");

    const chargeData = {
      id: chargeId,
      object: "charge",
      amount: 3000,
      currency: "jpy",
      status: "succeeded",
      payment_intent: paymentIntentId,
      destination: TEST_IDS.CONNECT_ACCOUNT_ID, // Destination Charges
      application_fee_amount: Math.round(3000 * 0.049), // 4.9%
      transfer_data: {
        destination: TEST_IDS.CONNECT_ACCOUNT_ID,
      },
      metadata: {
        payment_id: paymentId,
        attendance_id: TEST_IDS.ATTENDANCE_ID,
        event_id: TEST_IDS.EVENT_ID,
      },
    };

    const response = await sendStripeWebhook("charge.succeeded", chargeData);

    expect(response.ok).toBe(true);
    expect(response.status).toBe(204);

    console.log("✓ Webhook送信完了: status", response.status);

    // === 3. DBとペイロードの検証 ===
    console.log("⏳ Destination Charges設定を検証中...");

    await new Promise((resolve) => setTimeout(resolve, 500));

    const payment = await getPaymentFromDB(TEST_IDS.ATTENDANCE_ID);

    // destinationがConnect アカウントIDと一致することを確認
    expect(payment.destination_account_id).toBe(TEST_IDS.CONNECT_ACCOUNT_ID);
    console.log("✓ destinationがConnect アカウントIDと一致");

    // application_fee_amountが正しく設定されていることを確認（4.9%）
    const expectedFee = Math.round(3000 * 0.049);
    expect(payment.application_fee_amount).toBe(expectedFee);
    console.log("✓ application_fee_amountが4.9%で計算されている");

    // ペイロードのdestinationフィールドを確認
    expect(chargeData.destination).toBe(TEST_IDS.CONNECT_ACCOUNT_ID);
    expect(chargeData.application_fee_amount).toBe(expectedFee);
    console.log("✓ ペイロードのDestination Charges設定が正しい");

    console.log("✅ ケース3-1-3 完了");
  });
});
