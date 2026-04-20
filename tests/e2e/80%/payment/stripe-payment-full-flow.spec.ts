/**
 * Stripe決済の完全フロー E2Eテスト（Stripe CLI統合版）
 *
 * このテストは以下の完全なフローを検証します：
 * 1. イベント作成
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

test.use({ viewport: { width: 1280, height: 1200 } });

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

    // === 1. イベント作成（単一ページフォーム） ===
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "新しいイベント" }).click();

    // 基本情報
    await page.fill('[name="title"]', "E2Eテスト：Stripe決済フローテスト");

    // 日時を未来の日付に設定
    const eventDate = new Date();
    eventDate.setDate(eventDate.getDate() + 7); // 1週間後
    const regDeadline = new Date();
    regDeadline.setDate(regDeadline.getDate() + 5); // 5日後
    const payDeadline = new Date();
    payDeadline.setDate(payDeadline.getDate() + 6); // 6日後

    // 共通の日時入力ヘルパー
    const fillDateTimePicker = async (placeholder: string, date: Date, hour: string) => {
      // 1. Popoverを開く
      const labelText = placeholder.replace("を選択", "");
      const trigger = page
        .locator("div")
        .filter({ has: page.locator("label", { hasText: labelText }) })
        .last()
        .getByRole("button")
        .first();

      // ボタンを画面上部にスクロールして、ポップオーバーが下に表示されるスペースを確保
      await trigger.scrollIntoViewIfNeeded();
      await trigger.evaluate((el) => el.scrollIntoView({ block: "start" }));
      await trigger.click();

      // 2. ダイアログ（PopoverContent）を特定 (表示されているものを取得)
      const dialog = page.getByRole("dialog").filter({ visible: true }).last();
      await expect(dialog).toBeVisible();

      // 3. 正しい月まで移動
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const day = date.getDate();
      const targetMonthYear = `${year}年${month}月`;

      for (let i = 0; i < 12; i++) {
        const currentText = await dialog.getByRole("status").textContent();
        if (currentText?.includes(targetMonthYear)) {
          break;
        }
        const nextButton = dialog.getByRole("button", { name: /次|Next/i });
        if (await nextButton.isVisible()) {
          await nextButton.click();
          await page.waitForTimeout(300);
        } else {
          break;
        }
      }

      // 4. 日付の選択 (カレンダー内のボタン)
      const datePattern = `${year}年${month}月${day}日`;
      const dayButton = dialog.getByRole("button", { name: new RegExp(datePattern) });

      // ダイアログ内の日付ボタンをクリック
      // 既に選択されていない場合のみクリック（トグル解除を防止）
      const isSelected =
        (await dayButton.getAttribute("aria-selected")) === "true" ||
        (await dayButton.getAttribute("data-selected-single")) === "true";
      if (!isSelected) {
        await dayButton.click();
      }

      // 4. 時刻の選択（日付選択により有効化されるのを待機）
      const hourSelect = dialog.getByRole("combobox").nth(0);
      await expect(hourSelect).toBeEnabled({ timeout: 7000 });

      // 時刻選択の要素までスクロール
      await hourSelect.scrollIntoViewIfNeeded();

      await hourSelect.click();
      await page.getByRole("option", { name: `${hour}時` }).click();

      const minuteSelect = dialog.getByRole("combobox").nth(1);
      await minuteSelect.click();
      await page.getByRole("option", { name: "00分" }).click();

      // 5. 完了
      await dialog.getByRole("button", { name: "完了" }).click();
      await expect(dialog).toBeHidden();
    };

    // 開催日時
    await fillDateTimePicker("開催日時を選択", eventDate, "18");
    // 参加申込締切
    await fillDateTimePicker("参加申込締切を選択", regDeadline, "23");

    // 参加費を設定（1,000円）
    await page.fill('[name="fee"]', "1000");

    // オンライン決済を選択 (data-testid を活用)
    const onlinePaymentLabel = page.locator("label", { hasText: "オンライン決済" });
    await onlinePaymentLabel.click();

    // オンライン決済締切 (オンライン決済選択後に表示される)
    await fillDateTimePicker("オンライン決済締切を選択", payDeadline, "23");

    // 詳細情報
    await page.fill('[name="location"]', "テスト会場");

    // 送信
    await page.getByRole("button", { name: "イベントを作成" }).click();

    // イベント詳細ページに遷移したことを確認
    await expect(page).toHaveURL(
      /\/events\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      { timeout: 15000 }
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

    // === event / current community が verified payout_profile を指す状態へ揃える ===
    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // イベントから community / payout snapshot を取得
    const { data: eventData, error: eventError } = await supabase
      .from("events")
      .select("created_by, community_id, payout_profile_id")
      .eq("id", eventId)
      .single();

    if (eventError || !eventData) {
      throw new Error("Failed to fetch event payout context");
    }

    const testStripeAccountId = "acct_1TOADDEEczGHQjDD";
    let payoutProfileId = eventData.payout_profile_id;

    if (payoutProfileId) {
      const { error: payoutUpdateError } = await supabase
        .from("payout_profiles")
        .update({
          stripe_account_id: testStripeAccountId,
          status: "verified",
          collection_ready: true,
          charges_enabled: true,
          payouts_enabled: true,
          representative_community_id: eventData.community_id,
        })
        .eq("id", payoutProfileId);

      if (payoutUpdateError) {
        throw new Error(`Failed to update payout profile: ${payoutUpdateError.message}`);
      }
    } else {
      const { data: existingPayoutProfile, error: existingPayoutProfileError } = await supabase
        .from("payout_profiles")
        .select("id, representative_community_id")
        .eq("owner_user_id", eventData.created_by)
        .maybeSingle();

      if (existingPayoutProfileError) {
        throw new Error(
          `Failed to fetch existing payout profile: ${existingPayoutProfileError.message}`
        );
      }

      if (existingPayoutProfile) {
        payoutProfileId = existingPayoutProfile.id;

        const { error: payoutUpdateError } = await supabase
          .from("payout_profiles")
          .update({
            stripe_account_id: testStripeAccountId,
            status: "verified",
            collection_ready: true,
            charges_enabled: true,
            payouts_enabled: true,
            representative_community_id:
              existingPayoutProfile.representative_community_id ?? eventData.community_id,
          })
          .eq("id", existingPayoutProfile.id);

        if (payoutUpdateError) {
          throw new Error(`Failed to update payout profile: ${payoutUpdateError.message}`);
        }
      } else {
        const { data: insertedPayoutProfile, error: payoutInsertError } = await supabase
          .from("payout_profiles")
          .insert({
            owner_user_id: eventData.created_by,
            stripe_account_id: testStripeAccountId,
            status: "verified",
            collection_ready: true,
            charges_enabled: true,
            payouts_enabled: true,
            representative_community_id: eventData.community_id,
          })
          .select("id")
          .single();

        if (payoutInsertError || !insertedPayoutProfile) {
          throw new Error(`Failed to create payout profile: ${payoutInsertError?.message}`);
        }

        payoutProfileId = insertedPayoutProfile.id;
      }

      const { error: eventUpdateError } = await supabase
        .from("events")
        .update({ payout_profile_id: payoutProfileId })
        .eq("id", eventId);

      if (eventUpdateError) {
        throw new Error(`Failed to attach payout profile to event: ${eventUpdateError.message}`);
      }
    }

    const { error: communityUpdateError } = await supabase
      .from("communities")
      .update({ current_payout_profile_id: payoutProfileId })
      .eq("id", eventData.community_id);

    if (communityUpdateError) {
      throw new Error(
        `Failed to attach payout profile to current community: ${communityUpdateError.message}`
      );
    }

    console.log("✓ verified payout_profile 設定完了");

    // === 2. 招待リンクを取得 ===
    // 招待リンクが表示されていることを確認（新しいUIに対応）
    const inviteLinkCode = page
      .locator("code")
      .filter({ hasText: /\/invite\// })
      .first();
    await expect(inviteLinkCode).toBeVisible({ timeout: 10000 });
    const inviteUrl = (await inviteLinkCode.textContent())?.trim();

    if (!inviteUrl) {
      throw new Error("Failed to get invite URL from the page");
    }

    console.log("✓ 招待URL取得:", inviteUrl);

    // === 3. ゲストとして参加表明 ===
    // 招待リンクにアクセス
    await page.goto(inviteUrl, { timeout: 60000 });

    // 参加表明フォームの入力を開始
    await page.fill('[name="nickname"]', "テストユーザー");
    await page.fill('[name="email"]', "e2e-test@example.com");

    // 「参加」を選択 (ボタン形式)
    await page.getByRole("button", { name: "参加", exact: true }).click();

    // オンライン決済を選択 (ラジオボタン形式)
    await page.getByLabel("オンライン決済").check();

    // 参加表明を送信 ("登録する" ボタン)
    await page.getByRole("button", { name: "登録する" }).click();

    // 完了ページへの遷移を待つ (SuccessViewが表示される)
    await page.waitForSelector('text="登録完了"', { timeout: 10000 });

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

    // === 4. ゲストページにアクセスして決済 ===
    const guestPageUrl = `${page.url().split("/invite")[0]}/guest/${guestToken}`;
    await page.goto(guestPageUrl, { timeout: 60000 });

    console.log("✓ ゲストページに遷移:", guestPageUrl);

    // ページが読み込まれるまで待機
    await page.waitForLoadState("networkidle");

    // 「オンライン決済へ進む」ボタンをクリックしてStripe Checkoutへのリダイレクトを待つ
    await page.getByRole("button", { name: "オンライン決済へ進む" }).click();

    // Stripe Checkoutページまたはエラーメッセージのいずれかまで待機
    await Promise.race([
      page.waitForURL(/checkout\.stripe\.com/, { timeout: 10000 }),
      page.waitForSelector('text="決済エラー"', { timeout: 10000 }).catch(() => null),
    ]);

    // エラーが表示されていないか確認
    const errorAlert = page.locator('text="決済エラー"');
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
});
