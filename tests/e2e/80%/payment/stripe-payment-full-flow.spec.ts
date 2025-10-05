/**
 * Stripe決済の完全フロー E2Eテスト（Stripe CLI統合版）
 *
 * このテストは以下の完全なフローを検証します：
 * 1. イベント作成（マルチステップフォーム）
 * 2. 招待リンクの取得
 * 3. ゲストとして参加表明
 * 4. Checkout Session作成とURLへの遷移
 * 5. Stripe APIを使用した決済完了（Checkout UIをスキップ）
 * 6. Stripe CLIでWebhookイベントをトリガー（推奨アプローチ）
 * 7. Webhook処理（同期モードでQStashスキップ）
 * 8. 決済完了確認
 *
 * アプローチについて（Stripe公式ベストプラクティスに準拠）:
 *
 * 1. Checkout UIの操作を避ける
 *    Stripeの公式推奨に従い、実際のCheckoutページでのカード入力は行いません。
 *    理由: "Frontend interfaces have security measures that prevent automated testing"
 *
 * 2. Stripe CLIでWebhookイベントをトリガー（改善点）
 *    手動でイベントオブジェクトを構築する代わりに、Stripe CLIの `trigger` コマンドを使用。
 *    これにより、本物のイベント構造を保証し、テストの信頼性が向上します。
 *
 * 3. PaymentIntentをAPI経由で作成・確認
 *    実際の決済フローをシミュレートしながら、Checkout UIの操作を回避します。
 *
 * メリット:
 * - テストが安定する（Checkout UIのセキュリティ対策やレート制限を回避）
 * - 実行時間が短縮される
 * - 本物のWebhookイベント構造を使用（Stripe CLI）
 * - Stripeの公式推奨アプローチに準拠
 *
 * 前提条件:
 * - .env.test に SKIP_QSTASH_IN_TEST=true が設定されていること
 * - Stripe CLIがインストールされ、ログイン済みであること（`stripe login`）
 * - Stripe CLIが起動していること（別ターミナルで `stripe listen --forward-to localhost:3000/api/webhooks/stripe`）
 * - ローカルのSupabaseが起動していること
 * - 認証済みユーザーでログインしていること（Stripe Connect設定済み）
 *
 * Stripe CLIセットアップ:
 * ```bash
 * # インストール（macOS）
 * brew install stripe/stripe-cli/stripe
 *
 * # ログイン
 * stripe login
 *
 * # Webhookリスナーを起動（テスト実行前に必須）
 * stripe listen --forward-to localhost:3000/api/webhooks/stripe
 * ```
 *
 * 参考:
 * - https://docs.stripe.com/automated-testing
 * - https://docs.stripe.com/stripe-cli
 * - https://docs.stripe.com/webhooks#test-webhook
 * - Stripe公式: "Frontend interfaces have security measures that prevent automated testing"
 */

import { test, expect } from "@playwright/test";

import {
  waitForPaymentStatus,
  getPaymentFromDB,
  getAttendanceFromDB,
  cleanupTestData,
} from "../../helpers/payment-helpers";

test.describe("Stripe決済 完全フロー", () => {
  let eventId: string;
  let attendanceId: string;

  test.afterEach(async () => {
    // テストデータのクリーンアップ
    if (eventId) {
      await cleanupTestData(eventId);
    }
  });

  test("正常系: イベント作成 → 参加表明 → Stripe決済 → Webhook処理 → 決済完了", async ({
    page,
  }) => {
    // 環境変数の確認
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    // === 1. イベント作成（マルチステップフォーム） ===
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "新しいイベント" }).click();

    // ステップ1: 基本情報
    await page.fill('[name="title"]', "E2Eテスト：Stripe決済フローテスト");

    // 日時を未来の日付に設定（DateTimePickerコンポーネント）
    // 今月内の未来の日付を選択（月をまたぐ必要がないようにする）
    const futureDate = new Date();
    const today = futureDate.getDate();
    const daysInMonth = new Date(futureDate.getFullYear(), futureDate.getMonth() + 1, 0).getDate();

    // 今月内で3日後を選択（月末近くの場合は15日に設定）
    if (today + 3 <= daysInMonth) {
      futureDate.setDate(today + 3);
    } else {
      // 次の月の15日に設定
      futureDate.setMonth(futureDate.getMonth() + 1);
      futureDate.setDate(15);
    }

    // DateTimePickerを操作
    // 1. Popoverを開く
    await page
      .getByRole("button", { name: /日時を選択|開催日時/ })
      .first()
      .click();

    // 2. 必要に応じて次の月に移動
    if (today + 3 > daysInMonth) {
      // 次の月に移動するボタンをクリック
      await page.getByRole("button", { name: "Go to next month" }).click();
    }

    // 3. カレンダーから未来の日付を選択
    await page.waitForTimeout(500); // カレンダーの表示を待つ

    // 完全な日付文字列でボタンを探す（例: "2025年10月7日火曜日"）
    const year = futureDate.getFullYear();
    const month = futureDate.getMonth() + 1;
    const day = futureDate.getDate();
    const datePattern = `${year}年${month}月${day}日`;

    await page.getByRole("button", { name: new RegExp(datePattern) }).click();

    // 4. 時刻を選択（18時を選択）
    await page.waitForTimeout(500); // 時刻選択UIの表示を待つ

    // 時のドロップダウンを開く
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "18時" }).click();

    // 5. 分のドロップダウンを開く（00分を選択）
    await page.getByRole("combobox").last().click();
    await page.getByRole("option", { name: "00分" }).click();

    // 6. 完了ボタンをクリック
    await page.getByRole("button", { name: "完了" }).click();

    // 参加費を設定（1,000円）
    await page.fill('[name="fee"]', "1000");

    // ステップ2へ進む
    await page.getByRole("button", { name: "次へ進む" }).click();

    // ステップ2: 受付・決済設定
    // オンライン決済のチェックボックスを選択
    await page.getByRole("checkbox", { name: /オンライン決済/ }).check();

    // 参加申込締切は自動設定されるので、ここでは変更しない（または必要なら操作を追加）
    // DateTimePickerでの操作が必要な場合は、開催日時と同様の手順で操作します

    // ステップ3へ進む
    await page.getByRole("button", { name: "次へ進む" }).click();

    // ステップ3: 詳細情報（任意）
    await page.fill('[name="location"]', "テスト会場");

    // ステップ4（確認）へ進む
    await page.getByRole("button", { name: "次へ進む" }).click();

    // ステップ4: 確認・送信
    await page.getByRole("button", { name: "イベントを作成" }).click();

    // イベント詳細ページに遷移したことを確認
    // 注意: /events/create からの遷移なので、UUID形式を確実にマッチさせる
    await expect(page).toHaveURL(
      /\/events\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      { timeout: 10000 }
    );

    // URLからeventIdを取得
    const url = page.url();
    const eventIdMatch = url.match(
      /\/events\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/
    );
    const extractedEventId = eventIdMatch?.[1];
    if (!extractedEventId) {
      throw new Error(`Failed to extract event ID from URL: ${url}`);
    }
    eventId = extractedEventId;
    expect(eventId).toBeTruthy();

    console.log("✓ イベント作成完了:", eventId);

    // === Stripe Connectアカウントをテストユーザーに設定 ===
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // イベントからcreated_byを取得
    const { data: eventData, error: eventError } = await supabase
      .from("events")
      .select("created_by")
      .eq("id", eventId)
      .single();

    if (eventError || !eventData) {
      throw new Error("Failed to fetch event creator");
    }

    const testStripeAccountId = "acct_1SBSRtEKxiavaL3B";

    const { error: upsertError } = await supabase.from("stripe_connect_accounts").upsert(
      {
        user_id: eventData.created_by,
        stripe_account_id: testStripeAccountId,
        status: "verified",
        charges_enabled: true,
        payouts_enabled: true,
      },
      {
        onConflict: "user_id",
      }
    );

    if (upsertError) {
      throw new Error(`Failed to set stripe_connect_account: ${upsertError.message}`);
    }

    console.log("✓ Stripe Connectアカウント設定完了");

    // === 2. 招待リンクを取得 ===
    // 招待リンクをコピーボタンをクリック
    await page.getByRole("button", { name: "招待リンク" }).click();

    // Popoverが開くまで待機
    await page.waitForTimeout(500);

    // 招待URLをinputフィールドから取得
    const inviteUrlInput = page.locator('[data-testid="invite-url-input"]').first();
    await expect(inviteUrlInput).toBeVisible({ timeout: 5000 });

    const inviteUrl = await inviteUrlInput.inputValue();

    console.log("✓ 招待URL取得:", inviteUrl);

    // === 3. ゲストとして参加表明 ===
    // 招待リンクにアクセス
    await page.goto(inviteUrl);

    // イベント詳細が表示されるまで待機
    await page.waitForTimeout(1000);

    // 「参加申し込みをする」ボタンをクリックしてフォームを表示
    await page.getByRole("button", { name: "参加申し込みをする" }).click();

    // フォームが表示されるまで待機
    await page.waitForTimeout(500);

    // 参加表明フォームを入力
    await page.fill('[name="nickname"]', "テストユーザー");
    await page.fill('[name="email"]', "e2e-test@example.com");

    // 「参加」を選択
    await page.locator('[role="radio"][value="attending"]').check();

    // オンライン決済を選択
    await page
      .getByRole("radio", { name: /オンライン決済.*クレジットカード、Apple Pay、Google Payなど/ })
      .check();

    // 参加表明を送信
    await page.getByRole("button", { name: "参加申し込みを完了する" }).click();

    // 確認ページへの遷移を待つ
    await page.waitForTimeout(2000);

    console.log("✓ 参加表明完了");

    // attendance_idを取得するためにDBをチェック
    const supabase2 = await import("@supabase/supabase-js").then((m) =>
      m.createClient(supabaseUrl, supabaseServiceKey)
    );
    const { data: attendance, error: attendanceError } = await supabase2
      .from("attendances")
      .select("id, guest_token")
      .eq("event_id", eventId)
      .eq("email", "e2e-test@example.com")
      .single();

    if (attendanceError || !attendance) {
      throw new Error("Failed to fetch attendance from DB");
    }

    attendanceId = attendance.id;
    const guestToken = attendance.guest_token;
    expect(attendanceId).toBeTruthy();
    expect(guestToken).toBeTruthy();

    console.log("✓ 参加ID取得:", attendanceId);
    console.log("✓ ゲストトークン:", guestToken);

    // === DBの参加データを確認（デバッグ） ===
    const { data: attendanceCheck, error: checkError } = await supabase2
      .from("attendances")
      .select("id, guest_token, status, event_id")
      .eq("id", attendanceId)
      .single();

    console.log("✓ DB参加データ確認:", {
      found: !!attendanceCheck,
      error: checkError?.message,
      data: attendanceCheck,
    });

    // === 4. ゲストページにアクセスして決済 ===
    const guestPageUrl = `${page.url().split("/invite")[0]}/guest/${guestToken}`;
    await page.goto(guestPageUrl);

    console.log("✓ ゲストページに遷移:", guestPageUrl);

    // ページが読み込まれるまで待機
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // エラーメッセージがないことを確認
    const errorAlert = page.locator('text="決済エラー"');
    if (await errorAlert.isVisible()) {
      const errorText = await page.locator('div[role="alert"]').textContent();
      console.log("⚠️ 決済エラーが表示されています:", errorText);
      throw new Error(`Payment error displayed: ${errorText}`);
    }

    // 「決済を完了する」ボタンをクリックしてStripe Checkoutへのリダイレクトを待つ
    await page.getByRole("button", { name: "決済を完了する" }).click();

    // Stripe Checkoutページまたはエラーメッセージのいずれかまで待機
    await Promise.race([
      page.waitForURL(/checkout\.stripe\.com/, { timeout: 10000 }),
      page.waitForSelector('text="決済エラー"', { timeout: 10000 }).catch(() => null),
    ]);

    // エラーが表示されていないか確認
    if (await errorAlert.isVisible()) {
      const errorText = await page.locator('div[role="alert"]').textContent();
      throw new Error(`Payment error after button click: ${errorText}`);
    }

    // 現在のURLからCheckout Session IDを取得
    const currentUrl = page.url();
    console.log("✓ リダイレクト先URL:", currentUrl);

    // URLからセッションIDを抽出
    let checkoutSessionId: string | undefined;

    if (currentUrl.includes("checkout.stripe.com")) {
      // Stripe CheckoutページのURLからセッションIDを抽出
      const match = currentUrl.match(/\/pay\/([^/?#]+)/);
      if (match?.[1]) {
        checkoutSessionId = match[1];
      }
    } else {
      // DBから最新のCheckout Session IDを取得
      const { data: payment, error: paymentError } = await supabase2
        .from("payments")
        .select("stripe_checkout_session_id")
        .eq("attendance_id", attendanceId)
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

    // payment_idをDBから取得
    const { data: paymentRecord, error: paymentRecordError } = await supabase
      .from("payments")
      .select("id")
      .eq("attendance_id", attendanceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (paymentRecordError || !paymentRecord?.id) {
      throw new Error("Failed to fetch payment_id from DB");
    }

    const paymentId = paymentRecord.id;
    console.log("✓ Payment ID:", paymentId);

    const { completeCheckoutSessionViaWebhook } = await import("../../helpers/payment-helpers");
    await completeCheckoutSessionViaWebhook(checkoutSessionId, attendanceId, paymentId);

    console.log("✓ Payment completed and webhook triggered via Stripe CLI");

    // Webhookが処理されるまで少し待機（SKIP_QSTASH_IN_TEST=true なので同期処理）
    await page.waitForTimeout(1000);

    // === 7. Webhook処理とDB更新の確認 ===
    // SKIP_QSTASH_IN_TEST=true なので、Webhookは同期的に処理される
    // Stripe CLIでトリガーされたWebhookイベントがアプリケーションで処理され、DBが更新されることを確認

    console.log("⏳ Webhook処理とDB更新を待機中（Stripe CLI経由）...");

    const paymentCompleted = await waitForPaymentStatus(attendanceId, "paid", 15000);
    expect(paymentCompleted).toBe(true);

    console.log("✓ 決済ステータスが'paid'に更新");

    // === 8. 決済情報の詳細確認 ===
    const payment = await getPaymentFromDB(attendanceId);
    expect(payment.status).toBe("paid");
    expect(payment.amount).toBe(1000);
    expect(payment.method).toBe("stripe");
    expect(payment.stripe_payment_intent_id).toBeTruthy();
    expect(payment.stripe_checkout_session_id).toBeTruthy();

    console.log("✓ 決済情報の詳細確認完了:", {
      status: payment.status,
      amount: payment.amount,
      payment_intent: payment.stripe_payment_intent_id?.substring(0, 20) + "...",
    });

    // === 9. 参加情報の確認 ===
    const attendanceData = await getAttendanceFromDB(attendanceId);
    expect(attendanceData.status).toBe("attending");

    console.log("✓ 参加ステータス確認完了");

    // テスト成功
    console.log("🎉 Stripe決済完全フローテスト 成功（Stripe CLI統合版）");
  });

  test("異常系: 決済キャンセル", async ({ page: _page }) => {
    // TODO: 決済キャンセルフローのテスト
    test.skip();
  });

  test("異常系: カード決済失敗", async ({ page: _page }) => {
    // TODO: カード決済失敗フローのテスト（STRIPE_TEST_CARDS.DECLINED使用）
    test.skip();
  });
});
