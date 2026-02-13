import "server-only";

import Stripe from "stripe";

import { logger } from "@core/logging/app-logger";
import { getEnv } from "@core/utils/cloudflare-env";
import { handleServerError } from "@core/utils/error-handler.server";

// 明示固定: Stripe APIバージョン（SDK更新時はこの値を意図的に見直す）
const FIXED_STRIPE_API_VERSION: Stripe.LatestApiVersion = "2025-10-29.clover";

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
  if (stripeInstance) {
    return stripeInstance;
  }

  const env = getEnv();
  const stripeSecretKey = env.STRIPE_SECRET_KEY;

  if (!stripeSecretKey) {
    const key = "STRIPE_SECRET_KEY";
    const errorMessage = `Missing required environment variable: ${key}`;
    handleServerError("ENV_VAR_MISSING", {
      category: "system",
      action: "env_validation",
      actorType: "system",
      additionalData: {
        variable_name: key,
      },
    });
    throw new Error(errorMessage);
  }

  // デバッグログ: APIキーの詳細情報を出力
  logger.info("Stripe API Key Debug Info", {
    category: "system",
    action: "client_creation",
    actor_type: "system",
    key_length: stripeSecretKey.length,
    key_has_newlines: stripeSecretKey.includes("\n"),
    key_has_spaces: stripeSecretKey.includes(" "),
    key_has_tabs: stripeSecretKey.includes("\t"),
    node_env: env.NODE_ENV,
    outcome: "success",
  });

  const instance = new Stripe(stripeSecretKey, {
    apiVersion: FIXED_STRIPE_API_VERSION,
    // Cloudflare Workers use the Fetch API for their API requests.
    httpClient: Stripe.createFetchHttpClient(),
    // 自動リトライ設定（429/5xx/接続エラー対応）
    maxNetworkRetries: 3,
    // タイムアウト設定（30秒）
    timeout: 30000,
    appInfo: {
      name: "EventPay",
      version: "0.1.0",
    },
  });

  // Publishable Key はクライアント用。サーバー専用プロセスでは未設定でも動作させる。
  if (!env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
    logger.warn(
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set – client-side Stripe.js may fail to initialize",
      {
        category: "system",
        action: "env_validation",
        actor_type: "system",
        variable_name: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
        outcome: "failure",
      }
    );
  }

  // 本番ではログを抑制。必要なときだけ `STRIPE_LOG_VERBOSE=true` を設定して有効化する
  const shouldEnableStripeLogging =
    env.NODE_ENV !== "production" || env.STRIPE_LOG_VERBOSE === "true";

  if (shouldEnableStripeLogging) {
    instance.on("request", (req: Stripe.RequestEvent) => {
      logger.info("Stripe request initiated", {
        category: "payment",
        action: "payment_operation",
        actor_type: "system",
        idempotency_key: req.idempotency_key,
        method: req.method,
        path: req.path,
        stripe_account: req.account,
        outcome: "success",
      });
    });

    instance.on("response", (res: Stripe.ResponseEvent) => {
      logger.info("Stripe response received", {
        category: "payment",
        action: "payment_operation",
        actor_type: "system",
        stripe_request_id: res.request_id,
        status_code: res.status,
        latency_ms: res.elapsed,
        outcome: (res.status < 400 ? "success" : "failure") as any,
      });
    });
  }

  stripeInstance = instance;
  return stripeInstance;
}

/**
 * Webhook用シークレット（ローテーション対応：複数）の取得。
 * 環境変数に以下を想定：
 * - 本番: STRIPE_WEBHOOK_SECRET (primary), STRIPE_WEBHOOK_SECRET_SECONDARY (secondary)
 * - テスト: STRIPE_WEBHOOK_SECRET_TEST (primary), STRIPE_WEBHOOK_SECRET_TEST_SECONDARY (secondary)
 * いずれか存在するものを順序付き配列で返す。
 */
export const getWebhookSecrets = (): string[] => {
  const env = getEnv();
  const isProd = env.NODE_ENV === "production";
  const primary = isProd
    ? env.STRIPE_WEBHOOK_SECRET
    : (env.STRIPE_WEBHOOK_SECRET_TEST ?? env.STRIPE_WEBHOOK_SECRET);
  const secondary = isProd
    ? env.STRIPE_WEBHOOK_SECRET_SECONDARY
    : (env.STRIPE_WEBHOOK_SECRET_TEST_SECONDARY ?? env.STRIPE_WEBHOOK_SECRET_SECONDARY);
  const secrets = [primary, secondary].filter(
    (s): s is string => typeof s === "string" && s.length > 0
  );
  if (secrets.length === 0) {
    throw new Error(
      "At least one of STRIPE_WEBHOOK_SECRET[_TEST] is required for webhook processing"
    );
  }
  return secrets;
};

/**
 * Connect Webhook用シークレット（ローテーション対応：複数）の取得。
 * - 本番: STRIPE_CONNECT_WEBHOOK_SECRET (primary), STRIPE_CONNECT_WEBHOOK_SECRET_SECONDARY
 * - テスト: STRIPE_CONNECT_WEBHOOK_SECRET_TEST (primary), STRIPE_CONNECT_WEBHOOK_SECRET_TEST_SECONDARY
 */
export const getConnectWebhookSecrets = (): string[] => {
  const env = getEnv();
  const isProd = env.NODE_ENV === "production";
  const primary = isProd
    ? env.STRIPE_CONNECT_WEBHOOK_SECRET
    : (env.STRIPE_CONNECT_WEBHOOK_SECRET_TEST ?? env.STRIPE_CONNECT_WEBHOOK_SECRET);
  const secondary = isProd
    ? env.STRIPE_CONNECT_WEBHOOK_SECRET_SECONDARY
    : (env.STRIPE_CONNECT_WEBHOOK_SECRET_TEST_SECONDARY ??
      env.STRIPE_CONNECT_WEBHOOK_SECRET_SECONDARY);
  const secrets = [primary, secondary].filter(
    (s): s is string => typeof s === "string" && s.length > 0
  );
  if (secrets.length === 0) {
    throw new Error(
      "At least one of STRIPE_CONNECT_WEBHOOK_SECRET[_TEST] is required for webhook processing"
    );
  }
  return secrets;
};

/**
 * Idempotency Key生成関数
 * Stripe APIの二重実行防止のため、各リクエストごとに一意のUUIDを生成
 *
 * @param prefix - オプション：操作タイプのプレフィックス（デバッグ用）
 * @returns 一意のIdempotency-Key
 */
export const generateIdempotencyKey = (prefix?: string): string => {
  // Prefer UUID v4 when available
  if (typeof globalThis !== "undefined" && globalThis.crypto && "randomUUID" in globalThis.crypto) {
    const uuid = (globalThis.crypto as Crypto).randomUUID();
    return prefix ? `${prefix}_${uuid}` : uuid;
  }
  throw new Error("crypto.randomUUID is unavailable: cannot generate a secure idempotency key");
};

/**
 * Stripe API呼び出し用のオプション生成
 * idempotency_keyを含む共通オプションを提供
 */
export const createStripeRequestOptions = (idempotencyKey?: string): Stripe.RequestOptions => {
  const options: Stripe.RequestOptions = {};

  if (idempotencyKey) {
    options.idempotencyKey = idempotencyKey;
  }

  return options;
};
