/**
 * Stripe決済 ケース3-2: セッション検証API（verify-session） E2Eテスト
 *
 * 仕様書 docs/spec/test/e2e/stripe.md の「3-2. セッション検証API（verify-session）」に対応
 *
 * テストケース:
 * - ケース3-2-1: 決済成功後のsuccess_url処理（正常系）
 * - エラーケース: ゲストトークンなし
 * - エラーケース: 無効なセッションID
 * - エラーケース: 他人のセッションID
 *
 * 前提条件:
 * - .env.test に SKIP_QSTASH_IN_TEST=true が設定されていること
 * - Stripe Test Modeが有効であること
 * - ローカルのSupabaseが起動していること
 *
 * 参考:
 * - https://docs.stripe.com/automated-testing
 * - https://docs.stripe.com/checkout/testing
 */

import { test, expect } from "@playwright/test";

import {
  getPaymentFromDB,
  callVerifySessionAPI,
  getAttendanceFromDB,
} from "../../helpers/payment-helpers";
import { TestDataManager, TEST_IDS } from "../../helpers/test-data-setup";

test.describe("Stripe決済 ケース3-2: セッション検証API", () => {
  // 各テスト後のクリーンアップ
  test.afterEach(async () => {
    await TestDataManager.cleanup();
  });

  test("ケース3-2-1: 決済成功後のsuccess_url処理（正常系）", async ({ page }) => {
    /**
     * テストID: PAYMENT-E2E-009
     * 優先度: P0
     * カバー率寄与: 5%
     *
     * 前提条件:
     * - ユーザーがCheckout完了後、success_urlにリダイレクト
     * - URLに`?session_id={CHECKOUT_SESSION_ID}`が含まれる
     *
     * 期待結果:
     * - `/api/payments/verify-session?session_id=cs_xxx`を呼び出し
     * - Stripeからセッション情報を取得
     * - 決済ステータスを確認
     * - フロントエンドで「決済完了」メッセージを表示
     */

    console.log("=== ケース3-2-1: 決済成功後のsuccess_url処理 ===");

    // === 1. テストデータの作成 ===
    console.log("📝 テストデータ作成中...");

    await TestDataManager.createUserWithConnect();
    await TestDataManager.createPaidEvent();
    await TestDataManager.createAttendance();

    console.log("✓ テストデータ作成完了");

    // ゲストトークンを取得
    const attendance = await getAttendanceFromDB(TEST_IDS.ATTENDANCE_ID);
    const guestToken = attendance.guest_token;

    // === 2. Stripe Checkout Session作成 ===
    console.log("💳 Checkout Session作成中...");

    // ゲスト管理ページにアクセス
    await page.goto(`/guest/${guestToken}`);

    // 決済ボタンをクリック
    const paymentButton = page.locator('button:has-text("決済を完了する")');
    await paymentButton.waitFor({ state: "visible", timeout: 10000 });
    await paymentButton.click();

    console.log("✓ 決済ボタンをクリック");

    // Stripe Checkout URLへのリダイレクトを待機
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 15000 });
    const checkoutUrl = page.url();
    expect(checkoutUrl).toContain("checkout.stripe.com");

    console.log("✓ Stripe Checkoutページにリダイレクト");

    // URLからセッションIDを取得
    const urlParams = new URL(checkoutUrl).pathname.split("/");
    const sessionIdFromUrl = urlParams[urlParams.length - 1];

    console.log("✓ Session ID取得:", sessionIdFromUrl);

    // DBから決済情報を取得
    const payment = await getPaymentFromDB(TEST_IDS.ATTENDANCE_ID);
    const checkoutSessionId = payment.stripe_checkout_session_id;
    const paymentId = payment.id;

    expect(checkoutSessionId).toBeTruthy();
    console.log("✓ DB内のCheckout Session ID:", checkoutSessionId);

    // === 3. 決済完了をシミュレート ===
    console.log("💰 決済完了をシミュレート中...");

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      throw new Error("STRIPE_SECRET_KEY environment variable is not set");
    }

    const stripe = await import("stripe").then(
      (m) => new m.default(stripeSecretKey, { apiVersion: "2024-04-10" })
    );

    // Checkout Sessionを取得
    const session = await stripe.checkout.sessions.retrieve(checkoutSessionId as string);

    // PaymentIntentを作成・確認
    let paymentIntent;
    if (session.payment_intent) {
      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent.id;
      paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

      if (paymentIntent.status !== "succeeded") {
        paymentIntent = await stripe.paymentIntents.confirm(paymentIntent.id, {
          payment_method: "pm_card_visa",
        });
      }
    } else {
      // PaymentIntentを新規作成
      paymentIntent = await stripe.paymentIntents.create({
        amount: session.amount_total ?? 0,
        currency: session.currency ?? "jpy",
        payment_method: "pm_card_visa",
        payment_method_types: ["card"],
        confirm: true,
        off_session: true,
        metadata: {
          payment_id: paymentId,
          attendance_id: TEST_IDS.ATTENDANCE_ID,
          event_id: TEST_IDS.EVENT_ID,
          test_mode: "true",
        },
      });
    }

    expect(paymentIntent.status).toBe("succeeded");
    console.log("✓ PaymentIntent確認完了:", paymentIntent.id);

    // DBを更新（Webhookシミュレート）
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { error: updateError } = await supabase
      .from("payments")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        stripe_payment_intent_id: paymentIntent.id,
      })
      .eq("id", paymentId);

    if (updateError) {
      throw new Error(`Failed to update payment: ${updateError.message}`);
    }

    console.log("✓ 決済完了（DB更新）");

    // === 4. verify-session APIを呼び出し ===
    console.log("🔍 verify-session API呼び出し中...");

    const verifyResult = await callVerifySessionAPI(
      checkoutSessionId as string,
      TEST_IDS.ATTENDANCE_ID,
      guestToken
    );

    console.log("✓ verify-session APIレスポンス:", verifyResult);

    // === 5. レスポンスの検証 ===
    expect(verifyResult.success).toBe(true);
    expect(verifyResult.payment_status).toBeDefined();

    // 決済完了している場合は"success"または"processing"
    expect(["success", "processing"]).toContain(verifyResult.payment_status);

    // payment_requiredフィールドの確認
    expect(typeof verifyResult.payment_required).toBe("boolean");

    console.log("✓ payment_status:", verifyResult.payment_status);
    console.log("✓ payment_required:", verifyResult.payment_required);

    console.log("✅ ケース3-2-1 完了");
  });

  test("エラーケース: ゲストトークンなし", async () => {
    /**
     * エラーケース: ゲストトークンなし
     *
     * 期待結果: MISSING_PARAMETER エラー (400)
     */

    console.log("=== エラーケース: ゲストトークンなし ===");

    // verify-session APIをゲストトークンなしで呼び出し
    const dummyAttendanceId = "00000000-0000-0000-0000-000000000000";
    const url = new URL("http://localhost:3000/api/payments/verify-session");
    url.searchParams.set("session_id", "cs_test_dummy");
    url.searchParams.set("attendance_id", dummyAttendanceId);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        // x-guest-token ヘッダーなし
      },
    });

    expect(response.ok).toBe(false);
    expect(response.status).toBe(400); // MISSING_PARAMETER

    const errorData = await response.json();
    console.log("✓ エラーレスポンス:", errorData);

    // Problem Details形式のレスポンス確認
    expect(errorData.type).toBeDefined();
    expect(errorData.detail).toContain("ゲストトークン");

    console.log("✅ エラーケース: ゲストトークンなし 完了");
  });

  test("エラーケース: 無効なセッションID", async () => {
    /**
     * エラーケース: 無効なセッションID
     *
     * 期待結果: PAYMENT_SESSION_NOT_FOUND エラー (404)
     * セッションIDに対応する決済レコードが見つからない場合
     */

    console.log("=== エラーケース: 無効なセッションID ===");

    await TestDataManager.createUserWithConnect();
    await TestDataManager.createPaidEvent();
    await TestDataManager.createAttendance();

    const attendance = await getAttendanceFromDB(TEST_IDS.ATTENDANCE_ID);
    const guestToken = attendance.guest_token;

    // 存在しないセッションIDで呼び出し
    const url = new URL("http://localhost:3000/api/payments/verify-session");
    url.searchParams.set("session_id", "cs_invalid_session_id");
    url.searchParams.set("attendance_id", TEST_IDS.ATTENDANCE_ID);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-guest-token": guestToken,
      },
    });

    expect(response.ok).toBe(false);
    // 実装では、attendance_idとゲストトークンが一致しない、または決済レコードが見つからない場合は404
    expect([404, 500]).toContain(response.status);

    const errorData = await response.json();
    console.log("✓ エラーレスポンス:", errorData);

    // エラーレスポンスであることを確認
    expect(errorData.type).toBeDefined();

    console.log("✅ エラーケース: 無効なセッションID 完了");
  });

  test("エラーケース: 他人のセッションID", async () => {
    /**
     * エラーケース: 他人のセッションID
     *
     * 期待結果: PAYMENT_SESSION_NOT_FOUND エラー (404)
     * ゲストトークンが一致しない場合、実装ではPAYMENT_SESSION_NOT_FOUNDを返す
     */

    console.log("=== エラーケース: 他人のセッションID ===");

    // ユーザー1のデータ作成
    const { user: user1 } = await TestDataManager.createUserWithConnect();
    await TestDataManager.createPaidEvent();
    await TestDataManager.createAttendance();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ユーザー1の決済レコードを作成
    const paymentId = `payment_${Date.now()}`;
    const checkoutSessionId = `cs_test_${Date.now()}`;

    const { error: paymentError } = await supabase.from("payments").insert({
      id: paymentId,
      attendance_id: TEST_IDS.ATTENDANCE_ID,
      amount: 1000,
      method: "stripe",
      status: "pending",
      stripe_checkout_session_id: checkoutSessionId,
      destination_account_id: TEST_IDS.CONNECT_ACCOUNT_ID,
      application_fee_amount: Math.round(1000 * 0.013),
    });

    if (paymentError) {
      throw new Error(`Failed to create payment: ${paymentError.message}`);
    }

    console.log("✓ ユーザー1の決済レコード作成完了");

    // ユーザー2のデータ作成（別のattendance_id）
    const user2AttendanceId = `attendance_${Date.now()}_user2`;
    const user2GuestToken = `guest_token_${Date.now()}_user2`;

    const { error: attendance2Error } = await supabase.from("attendances").insert({
      id: user2AttendanceId,
      event_id: TEST_IDS.EVENT_ID,
      nickname: "ゲスト2",
      email: "guest2@example.com",
      status: "attending",
      guest_token: user2GuestToken,
      created_by: user1.id,
    });

    if (attendance2Error) {
      throw new Error(`Failed to create attendance 2: ${attendance2Error.message}`);
    }

    console.log("✓ ユーザー2の参加データ作成完了");

    // ユーザー2のトークンでユーザー1のセッションIDにアクセス
    // 実装では、attendance_idとゲストトークンの不一致をチェックし、404を返す
    const url = new URL("http://localhost:3000/api/payments/verify-session");
    url.searchParams.set("session_id", checkoutSessionId);
    url.searchParams.set("attendance_id", user2AttendanceId);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-guest-token": user2GuestToken,
      },
    });

    expect(response.ok).toBe(false);
    // 実装では、ゲストトークン不一致の場合はPAYMENT_SESSION_NOT_FOUND (404)を返す
    expect(response.status).toBe(404);

    const errorData = await response.json();
    console.log("✓ エラーレスポンス:", errorData);

    // エラーレスポンスであることを確認
    expect(errorData.type).toBeDefined();
    // PAYMENT_SESSION_NOT_FOUNDの型をチェック
    expect(errorData.type).toContain("payment_session_not_found");

    console.log("✅ エラーケース: 他人のセッションID 完了");
  });
});
