import "server-only";

import crypto from "crypto";

import Stripe from "stripe";

import { logger } from "@core/logging/app-logger";
import { getEnv } from "@core/utils/cloudflare-env";
import { getRequiredEnvVar } from "@core/utils/env-helper";

// 遅延初期化された Stripe クライアント（Cloudflare実行時のみ作成）
let cachedStripe: Stripe | undefined;

export function getStripe(): Stripe {
  if (cachedStripe) return cachedStripe;

  const env = getEnv();
  const stripeSecretKey = getRequiredEnvVar("STRIPE_SECRET_KEY");

  const instance = new Stripe(stripeSecretKey, {
    apiVersion:
      (env.STRIPE_API_VERSION as Stripe.LatestApiVersion | undefined) ?? "2025-09-30.clover",
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
      { tag: "stripeEnvCheck" }
    );
  }

  // 重複登録防止フラグ
  const hasRegisteredHooks = (global as unknown as { __stripeHooks?: boolean }).__stripeHooks;

  // 本番ではログを抑制。必要なときだけ `STRIPE_LOG_VERBOSE=true` を設定して有効化する
  const shouldEnableStripeLogging =
    env.NODE_ENV !== "production" || env.STRIPE_LOG_VERBOSE === "true";

  if (!hasRegisteredHooks && shouldEnableStripeLogging) {
    (global as unknown as { __stripeHooks?: boolean }).__stripeHooks = true;

    // Stripe request hook
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore - stripe typings don't expose "request" event yet
    if (typeof (instance as unknown as { on?: unknown }).on === "function") {
      (
        instance as unknown as {
          on: (event: string, cb: (arg: Record<string, unknown>) => void) => void;
        }
      ).on("request", (req: Record<string, unknown>) => {
        logger.info("Stripe request initiated", {
          tag: "stripeRequest",
          stripe_request_id: req.requestId as string | undefined,
          idempotency_key: req.idempotencyKey as string | undefined,
          method: req.method as string | undefined,
          path: req.path as string | undefined,
          stripe_account: req.stripeAccount as string | undefined,
        });
      });

      // Stripe response hook
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore - stripe typings don't expose "response" event yet
      (
        instance as unknown as {
          on: (event: string, cb: (arg: Record<string, unknown>) => void) => void;
        }
      ).on("response", (res: Record<string, unknown>) => {
        logger.info("Stripe response received", {
          tag: "stripeResponse",
          stripe_request_id: res.requestId as string | undefined,
          status: res.statusCode as number | undefined,
          latency_ms: res.elapsed as number | undefined,
          stripe_should_retry: (res.headers as Record<string, unknown> | undefined)?.[
            "stripe-should-retry"
          ] as string | undefined,
        });
      });
    }
  }

  cachedStripe = instance;
  return instance;
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
  const isProd = env.NODE_ENV === "production" || env.VERCEL_ENV === "production";
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
  const isProd = env.NODE_ENV === "production" || env.VERCEL_ENV === "production";
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

  // Fallback: cryptographically secure random bytes -> hex
  try {
    const buf = crypto.randomBytes(16); // 128 bits
    const hex = buf.toString("hex"); // 32 hex chars
    return prefix ? `${prefix}_${hex}` : hex;
  } catch {
    // Last resort: pseudo-random (not recommended for production)
    const fallback = `fallback_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    return prefix ? `${prefix}_${fallback}` : fallback;
  }
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
