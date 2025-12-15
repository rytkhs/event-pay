#!/usr/bin/env tsx

/**
 * Stripe本番Webhook設定スクリプト
 *
 * このスクリプトは本番環境（https://minnano-shukin.com）にStripe Webhookエンドポイントを
 * 自動登録します。通常のWebhookとConnect Webhookの両方に対応しています。
 *
 * 使用方法:
 * 1. STRIPE_SECRET_KEY環境変数を本番環境用（sk_live_xxx）に設定
 * 2. npm run stripe:setup-webhooks を実行
 * 3. 出力されたWebhook SecretをCloudflare Workers Secretsに登録
 */

import { config } from "dotenv";
import Stripe from "stripe";

// .env.localファイルを読み込み
config({ path: ".env.local" });

// 本番環境のWebhookエンドポイント
const PRODUCTION_BASE_URL = "https://minnano-shukin.com";
const WEBHOOK_ENDPOINT = `${PRODUCTION_BASE_URL}/api/webhooks/stripe`;
const CONNECT_WEBHOOK_ENDPOINT = `${PRODUCTION_BASE_URL}/api/webhooks/stripe-connect`;

// 通常のWebhookでリッスンするイベント
const WEBHOOK_EVENTS = [
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "payment_intent.canceled",
  "charge.succeeded",
  "charge.failed",
  "charge.refunded",
  "refund.created",
  "refund.updated",
  "refund.failed",
  "checkout.session.completed",
  "checkout.session.expired",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "application_fee.refunded",
  "application_fee.refund.updated",
  "charge.dispute.created",
  "charge.dispute.closed",
  "charge.dispute.updated",
  "charge.dispute.funds_reinstated",
];

// Connect Webhookでリッスンするイベント
const CONNECT_WEBHOOK_EVENTS = [
  "account.updated",
  "account.application.deauthorized",
  "payout.paid",
  "payout.failed",
];

interface WebhookSetupResult {
  id: string;
  secret: string;
  url: string;
  events: string[];
}

async function main() {
  console.log("🚀 Stripe本番Webhook設定スクリプトを開始します...\n");

  // 環境変数の確認
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    console.error("❌ エラー: STRIPE_SECRET_KEY環境変数が設定されていません");
    console.log("   .env.localファイルに以下を追加してください:");
    console.log("   STRIPE_SECRET_KEY=sk_live_your_stripe_secret_key");
    process.exit(1);
  }

  // 本番環境用のキーかチェック
  // if (!stripeSecretKey.startsWith("sk_live_")) {
  //   console.error("❌ エラー: STRIPE_SECRET_KEYが本番環境用ではありません");
  //   console.log("   本番環境用のキー（sk_live_で始まる）を設定してください");
  //   process.exit(1);
  // }

  console.log("✅ Stripe本番環境のシークレットキーを確認しました");

  // Stripeクライアントの初期化
  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: process.env.STRIPE_API_VERSION as Stripe.LatestApiVersion,
  });

  try {
    // 既存のWebhookエンドポイントを確認
    console.log("\n🔍 既存のWebhookエンドポイントを確認中...");
    const existingWebhooks = await stripe.webhookEndpoints.list({ limit: 100 });

    const existingWebhook = existingWebhooks.data.find(
      (webhook) => webhook.url === WEBHOOK_ENDPOINT
    );
    const existingConnectWebhook = existingWebhooks.data.find(
      (webhook) => webhook.url === CONNECT_WEBHOOK_ENDPOINT
    );

    if (existingWebhook) {
      console.log(`⚠️  既存の通常Webhookが見つかりました: ${existingWebhook.id}`);
      console.log("   既存のWebhookを削除して新しく作成しますか？ (y/N)");

      const readline = await import("readline");
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const answer = await new Promise<string>((resolve) => {
        rl.question("", resolve);
      });
      rl.close();

      if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
        console.log("🗑️  既存のWebhookを削除中...");
        await stripe.webhookEndpoints.del(existingWebhook.id);
        console.log("✅ 既存のWebhookを削除しました");
      } else {
        console.log("❌ 処理を中断しました");
        process.exit(0);
      }
    }

    if (existingConnectWebhook) {
      console.log(`⚠️  既存のConnect Webhookが見つかりました: ${existingConnectWebhook.id}`);
      console.log("   既存のConnect Webhookを削除して新しく作成しますか？ (y/N)");

      const readline = await import("readline");
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const answer = await new Promise<string>((resolve) => {
        rl.question("", resolve);
      });
      rl.close();

      if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
        console.log("🗑️  既存のConnect Webhookを削除中...");
        await stripe.webhookEndpoints.del(existingConnectWebhook.id);
        console.log("✅ 既存のConnect Webhookを削除しました");
      } else {
        console.log("❌ 処理を中断しました");
        process.exit(0);
      }
    }

    // 通常のWebhookエンドポイントを作成
    console.log("\n📡 通常のWebhookエンドポイントを作成中...");
    const webhook = await stripe.webhookEndpoints.create({
      url: WEBHOOK_ENDPOINT,
      enabled_events: WEBHOOK_EVENTS as Stripe.WebhookEndpointCreateParams.EnabledEvent[],
      description: "EventPay - 通常のStripe Webhook",
    });

    console.log("✅ 通常のWebhookエンドポイントを作成しました");
    console.log(`   ID: ${webhook.id}`);
    console.log(`   URL: ${webhook.url}`);
    console.log(`   Secret: ${webhook.secret}`);

    // Connect Webhookエンドポイントを作成
    console.log("\n📡 Connect Webhookエンドポイントを作成中...");
    const connectWebhook = await stripe.webhookEndpoints.create({
      url: CONNECT_WEBHOOK_ENDPOINT,
      enabled_events: CONNECT_WEBHOOK_EVENTS as Stripe.WebhookEndpointCreateParams.EnabledEvent[],
      description: "EventPay - Stripe Connect Webhook",
    });

    console.log("✅ Connect Webhookエンドポイントを作成しました");
    console.log(`   ID: ${connectWebhook.id}`);
    console.log(`   URL: ${connectWebhook.url}`);
    console.log(`   Secret: ${connectWebhook.secret}`);

    // 結果をまとめて表示
    console.log("\n🎉 Webhook設定が完了しました！");
    console.log("\n📋 設定結果:");
    console.log("=".repeat(60));

    console.log("\n🔹 通常のWebhook:");
    console.log(`   ID: ${webhook.id}`);
    console.log(`   URL: ${webhook.url}`);
    console.log(`   Secret: ${webhook.secret}`);
    console.log(`   イベント数: ${webhook.enabled_events.length}`);

    console.log("\n🔹 Connect Webhook:");
    console.log(`   ID: ${connectWebhook.id}`);
    console.log(`   URL: ${connectWebhook.url}`);
    console.log(`   Secret: ${connectWebhook.secret}`);
    console.log(`   イベント数: ${connectWebhook.enabled_events.length}`);

    console.log("\n📝 次のステップ:");
    console.log("1. 上記のWebhook SecretをCloudflare Workers Secretsに登録してください");
    console.log("2. 環境変数名:");
    console.log(`   - STRIPE_WEBHOOK_SECRET: ${webhook.secret}`);
    console.log(`   - STRIPE_CONNECT_WEBHOOK_SECRET: ${connectWebhook.secret}`);
    console.log("3. Stripe DashboardでWebhookエンドポイントを確認してください");
    console.log("4. テスト決済でWebhookが正常に動作することを確認してください");

    console.log("\n⚠️  重要:");
    console.log("- Webhook Secretは安全に保管してください");
    console.log("- 本番環境でのみ使用してください");
    console.log("- 定期的にWebhook Secretをローテーションすることを推奨します");
  } catch (error) {
    console.error("❌ エラーが発生しました:", error);

    if (error instanceof Stripe.errors.StripeError) {
      console.error(`   Stripeエラー: ${error.message}`);
      console.error(`   エラーコード: ${error.code}`);
    }

    process.exit(1);
  }
}

// スクリプト実行
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("❌ 予期しないエラー:", error);
    process.exit(1);
  });
}
