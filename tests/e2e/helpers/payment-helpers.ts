/**
 * Stripe決済E2Eテスト用ヘルパー関数
 */

import { exec } from "child_process";
import { promisify } from "util";

import { createClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import type { Database } from "@/types/database";

const execAsync = promisify(exec);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

/**
 * テスト用のSupabase管理クライアント
 */
const getSupabaseAdmin = () => {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment variables"
    );
  }
  return createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};

/**
 * 決済ステータスが指定の値になるまでポーリング
 *
 * 注意: 複数の決済レコードが存在する場合は、最新のもの（updated_at降順）を確認します
 */
export async function waitForPaymentStatus(
  attendanceId: string,
  expectedStatus: string,
  timeoutMs: number = 30000
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const startTime = Date.now();
  const pollInterval = 500; // 500msごとにチェック

  while (Date.now() - startTime < timeoutMs) {
    const { data: payments, error } = await supabase
      .from("payments")
      .select("status")
      .eq("attendance_id", attendanceId)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      throw new Error(`Failed to fetch payment: ${error.message}`);
    }

    const payment = payments && payments.length > 0 ? payments[0] : null;

    if (payment && payment.status === expectedStatus) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(
    `Timeout: Payment status did not become '${expectedStatus}' within ${timeoutMs}ms`
  );
}

/**
 * DBから決済情報を取得
 *
 * 注意: 複数の決済レコードが存在する場合は、最新のもの（updated_at降順）を返します
 */
export async function getPaymentFromDB(attendanceId: string) {
  const supabase = getSupabaseAdmin();
  const { data: payments, error } = await supabase
    .from("payments")
    .select("*")
    .eq("attendance_id", attendanceId)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Failed to fetch payment: ${error.message}`);
  }

  if (!payments || payments.length === 0) {
    throw new Error("No payment found for attendance");
  }

  return payments[0];
}

/**
 * 参加情報を取得
 */
export async function getAttendanceFromDB(attendanceId: string) {
  const supabase = getSupabaseAdmin();
  const { data: attendance, error } = await supabase
    .from("attendances")
    .select("*")
    .eq("id", attendanceId)
    .single();

  if (error) {
    throw new Error(`Failed to fetch attendance: ${error.message}`);
  }

  return attendance;
}

/**
 * イベント情報を取得
 */
export async function getEventFromDB(eventId: string) {
  const supabase = getSupabaseAdmin();
  const { data: event, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .single();

  if (error) {
    throw new Error(`Failed to fetch event: ${error.message}`);
  }

  return event;
}

/**
 * テストデータをクリーンアップ
 */
export async function cleanupTestData(eventId: string) {
  const supabase = getSupabaseAdmin();

  // イベントを削除（カスケード削除で参加者・決済も削除される）
  const { error } = await supabase.from("events").delete().eq("id", eventId);

  if (error) {
    console.error(`Failed to cleanup test data: ${error.message}`);
  }
}

/**
 * Stripeのテストカード番号
 */
export const STRIPE_TEST_CARDS = {
  SUCCESS: "4242424242424242",
  DECLINED: "4000000000000002",
  INSUFFICIENT_FUNDS: "4000000000009995",
  REQUIRES_AUTHENTICATION: "4000002500003155",
} as const;

/**
 * テスト用のカード情報を入力
 */
export async function fillStripeTestCard(
  page: any,
  cardNumber: string = STRIPE_TEST_CARDS.SUCCESS
) {
  // Stripeのホスト決済ページのフィールドを待機
  await page.waitForSelector('iframe[name^="__privateStripeFrame"]', { timeout: 10000 });

  // Stripe Elementsのiframe内でカード情報を入力
  const cardNumberFrame = page.frameLocator('iframe[name^="__privateStripeFrame"]').first();

  // カード番号
  await cardNumberFrame.locator('[name="number"]').fill(cardNumber);

  // 有効期限
  await cardNumberFrame.locator('[name="expiry"]').fill("12/34");

  // CVC
  await cardNumberFrame.locator('[name="cvc"]').fill("123");
}

/**
 * Stripe CLIを使ってWebhookイベントをトリガー
 *
 * Stripe公式推奨のアプローチ：
 * - Stripe CLIの`trigger`コマンドを使用して、実際のイベント構造を保証
 * - 手動でイベントオブジェクトを構築するよりも信頼性が高い
 *
 * 参考: https://docs.stripe.com/automated-testing
 * 参考: https://docs.stripe.com/webhooks#test-webhook
 */
type OverrideEntry = {
  resource: string;
  field: string;
  value: string;
};

type MetadataOverrideEntry = {
  resource: string;
  key: string;
  value: string;
};

const escapeCliValue = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;

export async function triggerStripeWebhookEvent(
  eventType: string,
  options?: {
    overrides?: OverrideEntry[];
    metadataOverrides?: MetadataOverrideEntry[];
  }
): Promise<void> {
  try {
    let command = `stripe trigger ${eventType}`;

    const composedOverrides: OverrideEntry[] = [...(options?.overrides ?? [])];

    if (options?.metadataOverrides) {
      for (const metadata of options.metadataOverrides) {
        composedOverrides.push({
          resource: metadata.resource,
          field: `metadata[${metadata.key}]`,
          value: metadata.value,
        });
      }
    }

    for (const override of composedOverrides) {
      command += ` --override ${override.resource}:${override.field}=${escapeCliValue(override.value)}`;
    }

    // eslint-disable-next-line no-console
    console.log(`⚡ Triggering Stripe event: ${command}`);

    const { stdout, stderr } = await execAsync(command);

    if (stderr && !stderr.includes("Trigger succeeded")) {
      throw new Error(`Stripe CLI error: ${stderr}`);
    }

    // eslint-disable-next-line no-console
    console.log(`✓ ${eventType} triggered successfully via Stripe CLI`);
    // eslint-disable-next-line no-console
    if (stdout) console.log(stdout);
  } catch (error) {
    throw new Error(`Failed to trigger ${eventType} via Stripe CLI: ${error}`);
  }
}

/**
 * Stripe Checkout Sessionを完了させてWebhookイベントをトリガー（改善版）
 *
 * Stripeの推奨アプローチに従い、以下のフローでテストします：
 * 1. Checkout Sessionから関連情報を取得
 * 2. PaymentIntentを作成・確認（実際の決済をシミュレート）
 * 3. Stripe CLIを使ってWebhookイベントをトリガー（推奨方法）
 *
 * このアプローチの利点：
 * - 実際のCheckout UIの操作を回避（セキュリティ対策により不安定）
 * - Stripe CLIで本物のイベント構造を使用（信頼性向上）
 * - Webhook処理フローを正確にテスト
 *
 * 参考: https://docs.stripe.com/automated-testing
 * 参考: https://docs.stripe.com/stripe-cli#trigger-events
 */
export async function completeCheckoutSessionViaWebhook(
  checkoutSessionId: string,
  attendanceId: string,
  paymentId: string
): Promise<void> {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY environment variable is not set");
  }

  const stripe = await import("stripe").then(
    (m) => new m.default(stripeSecretKey, { apiVersion: "2024-04-10" })
  );

  // Checkout Sessionを取得
  const session = await stripe.checkout.sessions.retrieve(checkoutSessionId);

  // eslint-disable-next-line no-console
  console.log("✓ Checkout Session retrieved:", {
    id: session.id,
    status: session.status,
    payment_status: session.payment_status,
    amount_total: session.amount_total,
    metadata: session.metadata,
  });

  // DBから決済情報を取得（Destination Charges用の情報を取得）
  const supabase = getSupabaseAdmin();
  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select("destination_account_id, application_fee_amount, transfer_group")
    .eq("attendance_id", attendanceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (paymentError || !payment) {
    throw new Error(
      `Failed to fetch payment data: ${paymentError?.message || "Payment not found"}`
    );
  }

  // eslint-disable-next-line no-console
  console.log("✓ Payment data retrieved:", {
    destination_account_id: payment.destination_account_id,
    application_fee_amount: payment.application_fee_amount,
    transfer_group: payment.transfer_group,
  });

  // 実際のCheckout Sessionに紐づくPaymentIntentを確認（フォールバック用）
  let paymentIntent: Stripe.PaymentIntent | null = null;

  const ensurePaymentIntent = async () => {
    if (paymentIntent && paymentIntent.status === "succeeded") {
      return paymentIntent;
    }

    if (session.payment_intent) {
      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent.id;
      const retrieved = await stripe.paymentIntents.retrieve(paymentIntentId);

      if (retrieved.status !== "succeeded") {
        paymentIntent = await stripe.paymentIntents.confirm(retrieved.id, {
          payment_method: "pm_card_visa",
        });
      } else {
        paymentIntent = retrieved;
      }

      // eslint-disable-next-line no-console
      console.log("✓ PaymentIntent confirmed for fallback:", {
        id: paymentIntent.id,
        status: paymentIntent.status,
      });
    } else {
      paymentIntent = await stripe.paymentIntents.create({
        amount: session.amount_total ?? 0,
        currency: session.currency ?? "jpy",
        payment_method: "pm_card_visa",
        payment_method_types: ["card"],
        confirm: true,
        off_session: true,
        ...(payment.destination_account_id && {
          transfer_data: {
            destination: payment.destination_account_id,
          },
        }),
        ...(payment.application_fee_amount && {
          application_fee_amount: payment.application_fee_amount,
        }),
        ...(payment.transfer_group && {
          transfer_group: payment.transfer_group,
        }),
        metadata: {
          ...session.metadata,
          checkout_session_id: checkoutSessionId,
          attendance_id: attendanceId,
          test_mode: "true",
        },
      });

      // eslint-disable-next-line no-console
      console.log("✓ PaymentIntent created for test:", {
        id: paymentIntent.id,
        status: paymentIntent.status,
      });
    }

    const { error: updateError } = await supabase
      .from("payments")
      .update({
        stripe_payment_intent_id: paymentIntent.id,
        stripe_checkout_session_id: checkoutSessionId,
      })
      .eq("attendance_id", attendanceId);

    if (updateError) {
      // eslint-disable-next-line no-console
      console.warn("⚠️ Failed to update payment with PaymentIntent ID:", updateError.message);
    }

    return paymentIntent;
  };

  const ensuredPaymentIntent = await ensurePaymentIntent();

  if (!ensuredPaymentIntent) {
    throw new Error("Failed to ensure PaymentIntent for test checkout session");
  }

  paymentIntent = ensuredPaymentIntent;

  // Stripe CLIを使ってWebhookイベントをトリガー（推奨アプローチ）
  // 本物のイベント構造を使用するため、信頼性が高い

  // まず、checkout.session.completedイベントをトリガー
  // 注: Stripe CLIのtriggerコマンドはモックイベントを生成するため、
  // 実際のCheckout SessionとPaymentIntentを紐付けるには、
  // DBを介して関連付ける必要があります

  try {
    // payment_intent.succeededイベントをトリガー
    await triggerStripeWebhookEvent("payment_intent.succeeded", {
      overrides: [
        {
          resource: "payment_intent",
          field: "amount",
          value: String(session.amount_total ?? 0),
        },
        {
          resource: "payment_intent",
          field: "currency",
          value: session.currency ?? "jpy",
        },
        ...(payment.destination_account_id
          ? [
              {
                resource: "payment_intent",
                field: "transfer_data[destination]",
                value: payment.destination_account_id,
              } as OverrideEntry,
            ]
          : []),
        ...(payment.application_fee_amount
          ? [
              {
                resource: "payment_intent",
                field: "application_fee_amount",
                value: String(payment.application_fee_amount),
              } as OverrideEntry,
            ]
          : []),
        ...(payment.transfer_group
          ? [
              {
                resource: "payment_intent",
                field: "transfer_group",
                value: payment.transfer_group,
              } as OverrideEntry,
            ]
          : []),
      ],
      metadataOverrides: [
        {
          resource: "payment_intent",
          key: "payment_id",
          value: paymentId,
        },
        {
          resource: "payment_intent",
          key: "attendance_id",
          value: attendanceId,
        },
        {
          resource: "payment_intent",
          key: "checkout_session_id",
          value: checkoutSessionId,
        },
        {
          resource: "payment_intent",
          key: "test_mode",
          value: "true",
        },
        ...Object.entries(session.metadata ?? {}).map(([key, value]) => ({
          resource: "payment_intent",
          key,
          value: String(value ?? ""),
        })),
      ],
    });

    // 少し待機してイベントが処理されるのを待つ
    await new Promise((resolve) => setTimeout(resolve, 500));

    // checkout.session.completedイベントをトリガー
    await triggerStripeWebhookEvent("checkout.session.completed", {
      overrides: [
        {
          resource: "checkout_session",
          field: "amount_total",
          value: String(session.amount_total ?? 0),
        },
        {
          resource: "checkout_session",
          field: "currency",
          value: session.currency ?? "jpy",
        },
        {
          resource: "checkout_session",
          field: "payment_status",
          value: "paid",
        },
        {
          resource: "checkout_session",
          field: "status",
          value: "complete",
        },
      ],
      metadataOverrides: [
        {
          resource: "checkout_session",
          key: "payment_id",
          value: paymentId,
        },
        {
          resource: "checkout_session",
          key: "attendance_id",
          value: attendanceId,
        },
        {
          resource: "checkout_session",
          key: "checkout_session_id",
          value: checkoutSessionId,
        },
        {
          resource: "checkout_session",
          key: "test_mode",
          value: "true",
        },
        ...Object.entries(session.metadata ?? {}).map(([key, value]) => ({
          resource: "checkout_session",
          key,
          value: String(value ?? ""),
        })),
      ],
    });

    // eslint-disable-next-line no-console
    console.log("✓ All webhook events triggered via Stripe CLI");
  } catch (error) {
    // Stripe CLIが利用できない場合は、フォールバック（後方互換性）
    // eslint-disable-next-line no-console
    console.warn("⚠️ Stripe CLI not available, falling back to manual webhook trigger:", error);

    // 手動でWebhookをトリガー（従来の方法）
    await triggerWebhookManually(
      session,
      paymentIntent,
      checkoutSessionId,
      attendanceId,
      paymentId
    );
  }
}

/**
 * Webhookを手動でトリガーする（フォールバック用）
 *
 * Stripe CLIが利用できない環境での後方互換性のために保持
 */
async function triggerWebhookManually(
  session: any,
  paymentIntent: any,
  checkoutSessionId: string,
  attendanceId: string,
  paymentId: string
): Promise<void> {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY environment variable is not set");
  }

  const stripe = await import("stripe").then(
    (m) => new m.default(stripeSecretKey, { apiVersion: "2024-04-10" })
  );

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET_TEST || process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET_TEST or STRIPE_WEBHOOK_SECRET environment variable is not set"
    );
  }

  const webhookUrl = "http://localhost:3000/api/webhooks/stripe";

  const enrichMetadata = (resource: any) => ({
    ...resource,
    metadata: {
      ...(resource.metadata ?? {}),
      payment_id: paymentId,
      checkout_session_id: checkoutSessionId,
      attendance_id: attendanceId,
      test_mode: "true",
    },
  });

  const triggerEvent = async (eventType: string, eventObject: any) => {
    const payload = JSON.stringify({
      id: `evt_test_${eventType}_${Date.now()}`,
      object: "event",
      type: eventType,
      data: {
        object: enrichMetadata(eventObject),
      },
      created: Math.floor(Date.now() / 1000),
    });

    const signature = await stripe.webhooks.generateTestHeaderString({
      payload,
      secret: webhookSecret,
      timestamp: Math.floor(Date.now() / 1000),
    });

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": signature,
      },
      body: payload,
    });

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(
        `${eventType} webhook failed: ${response.status} ${response.statusText} - ${responseText}`
      );
    }

    // eslint-disable-next-line no-console
    console.log(`✓ ${eventType} event dispatched manually`);
  };

  // Checkout Sessionにpayment_intentを追加
  const updatedSession = {
    ...session,
    payment_intent: paymentIntent.id,
    payment_status: "paid" as const,
    status: "complete" as const,
  };

  // Webhookイベントを順次トリガー
  await triggerEvent("checkout.session.completed", updatedSession);
  await triggerEvent("payment_intent.succeeded", paymentIntent);

  // eslint-disable-next-line no-console
  console.log("✓ All webhook events dispatched manually (fallback)");
}

/**
 * Webhookペイロードを手動で送信
 *
 * Stripe Webhookエンドポイントに直接POSTリクエストを送信します。
 * テスト用の署名を生成して、実際のWebhook処理をテストします。
 *
 * @param eventType - Stripeイベントタイプ（例: "payment_intent.succeeded"）
 * @param eventData - イベントデータオブジェクト
 * @param metadata - イベントデータのmetadataに追加する情報
 * @returns fetch Response
 */
export async function sendStripeWebhook(
  eventType: string,
  eventData: any,
  metadata?: Record<string, string>
): Promise<Response> {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    throw new Error("STRIPE_SECRET_KEY environment variable is not set");
  }

  const stripe = await import("stripe").then(
    (m) => new m.default(stripeSecretKey, { apiVersion: "2024-04-10" })
  );

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET_TEST || process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET_TEST or STRIPE_WEBHOOK_SECRET environment variable is not set"
    );
  }

  const webhookUrl = "http://localhost:3000/api/webhooks/stripe";

  // metadataをイベントデータにマージ
  const enrichedEventData = {
    ...eventData,
    metadata: {
      ...(eventData.metadata ?? {}),
      ...metadata,
    },
  };

  // Webhookペイロードを構築
  const payload = JSON.stringify({
    id: `evt_test_${eventType.replace(/\./g, "_")}_${Date.now()}`,
    object: "event",
    type: eventType,
    data: {
      object: enrichedEventData,
    },
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    api_version: "2024-04-10",
  });

  // Stripe署名を生成
  const signature = await stripe.webhooks.generateTestHeaderString({
    payload,
    secret: webhookSecret,
    timestamp: Math.floor(Date.now() / 1000),
  });

  // Webhookエンドポイントに送信
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": signature,
    },
    body: payload,
  });

  return response;
}

/**
 * verify-session APIを呼び出し
 *
 * 決済セッション検証APIエンドポイントを呼び出し、決済ステータスを確認します。
 *
 * @param sessionId - Stripe Checkout Session ID
 * @param attendanceId - 参加ID
 * @param guestToken - ゲストトークン
 * @returns APIレスポンスのJSON
 */
export async function callVerifySessionAPI(
  sessionId: string,
  attendanceId: string,
  guestToken: string
): Promise<any> {
  const url = new URL("http://localhost:3000/api/payments/verify-session");
  url.searchParams.set("session_id", sessionId);
  url.searchParams.set("attendance_id", attendanceId);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "x-guest-token": guestToken,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `verify-session API failed: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  return await response.json();
}
