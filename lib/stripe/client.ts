import Stripe from "stripe";
import { logger } from "@/lib/logging/app-logger";

// サーバーサイドで必須となる環境変数のみチェックする
const serverRequiredEnvVars = {
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
} as const;

for (const [key, value] of Object.entries(serverRequiredEnvVars)) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

// Publishable Key はクライアント用。サーバー専用プロセスでは未設定でも動作させる。
if (!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
  logger.warn("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set – client-side Stripe.js may fail to initialize", {
    tag: "stripeEnvCheck",
  });
}

// Stripeクライアントの初期化（Destination charges対応）
const stripeSecretKey = process.env.STRIPE_SECRET_KEY!;
export const stripe = new Stripe(stripeSecretKey, {
  apiVersion: (process.env.STRIPE_API_VERSION as Stripe.LatestApiVersion | undefined) ?? "2024-04-10",
  // 自動リトライ設定（429/5xx/接続エラー対応）
  maxNetworkRetries: 3,
  // タイムアウト設定（30秒）
  timeout: 30000,
  appInfo: {
    name: "EventPay",
    version: "1.0.0",
  },
});

// We'll insert event hooks once to avoid duplicate registration in hot reload environments.
const hasRegisteredHooks = (global as unknown as { __stripeHooks?: boolean }).__stripeHooks;

// 本番ではログを抑制。必要なときだけ `STRIPE_LOG_VERBOSE=true` を設定して有効化する
const shouldEnableStripeLogging =
  process.env.NODE_ENV !== "production" || process.env.STRIPE_LOG_VERBOSE === "true";

if (!hasRegisteredHooks && shouldEnableStripeLogging) {
  (global as unknown as { __stripeHooks?: boolean }).__stripeHooks = true;

  // Stripe request hook
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - stripe typings don't expose "request" event yet
  if (typeof (stripe as unknown as { on?: unknown }).on === "function") {
    (stripe as unknown as { on: (event: string, cb: (arg: Record<string, unknown>) => void) => void }).on("request", (req: Record<string, unknown>) => {
      logger.info("Stripe request initiated", {
        tag: 'stripeRequest',
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
    (stripe as unknown as { on: (event: string, cb: (arg: Record<string, unknown>) => void) => void }).on("response", (res: Record<string, unknown>) => {
      logger.info("Stripe response received", {
        tag: 'stripeResponse',
        stripe_request_id: res.requestId as string | undefined,
        status: res.statusCode as number | undefined,
        latency_ms: res.elapsed as number | undefined,
        stripe_should_retry: (res.headers as Record<string, unknown> | undefined)?.["stripe-should-retry"] as string | undefined,
      });
    });
  }
}


/**
 * Webhook用シークレット（ローテーション対応：複数）の取得。
 * 環境変数に以下を想定：
 * - 本番: STRIPE_WEBHOOK_SECRET (primary), STRIPE_WEBHOOK_SECRET_SECONDARY (secondary)
 * - テスト: STRIPE_WEBHOOK_SECRET_TEST (primary), STRIPE_WEBHOOK_SECRET_TEST_SECONDARY (secondary)
 * いずれか存在するものを順序付き配列で返す。
 */
export const getWebhookSecrets = (): string[] => {
  const isProd = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
  const primary = isProd ? process.env.STRIPE_WEBHOOK_SECRET : (process.env.STRIPE_WEBHOOK_SECRET_TEST ?? process.env.STRIPE_WEBHOOK_SECRET);
  const secondary = isProd ? process.env.STRIPE_WEBHOOK_SECRET_SECONDARY : (process.env.STRIPE_WEBHOOK_SECRET_TEST_SECONDARY ?? process.env.STRIPE_WEBHOOK_SECRET_SECONDARY);
  const secrets = [primary, secondary].filter((s): s is string => typeof s === "string" && s.length > 0);
  if (secrets.length === 0) {
    throw new Error("At least one of STRIPE_WEBHOOK_SECRET[_TEST] is required for webhook processing");
  }
  return secrets;
};

/**
 * Connect Webhook用シークレット（ローテーション対応：複数）の取得。
 * - 本番: STRIPE_CONNECT_WEBHOOK_SECRET (primary), STRIPE_CONNECT_WEBHOOK_SECRET_SECONDARY
 * - テスト: STRIPE_CONNECT_WEBHOOK_SECRET_TEST (primary), STRIPE_CONNECT_WEBHOOK_SECRET_TEST_SECONDARY
 */
export const getConnectWebhookSecrets = (): string[] => {
  const isProd = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
  const primary = isProd ? process.env.STRIPE_CONNECT_WEBHOOK_SECRET : (process.env.STRIPE_CONNECT_WEBHOOK_SECRET_TEST ?? process.env.STRIPE_CONNECT_WEBHOOK_SECRET);
  const secondary = isProd ? process.env.STRIPE_CONNECT_WEBHOOK_SECRET_SECONDARY : (process.env.STRIPE_CONNECT_WEBHOOK_SECRET_TEST_SECONDARY ?? process.env.STRIPE_CONNECT_WEBHOOK_SECRET_SECONDARY);
  const secrets = [primary, secondary].filter((s): s is string => typeof s === "string" && s.length > 0);
  if (secrets.length === 0) {
    throw new Error("At least one of STRIPE_CONNECT_WEBHOOK_SECRET[_TEST] is required for webhook processing");
  }
  return secrets;
};

// Stripe設定の取得
export const stripeConfig = {
  secretKey: process.env.STRIPE_SECRET_KEY!,
  publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
} as const;

/**
 * Idempotency Key生成関数
 * Destination charges対応でCheckout/PaymentIntents作成時の二重作成防止
 */
export const generateIdempotencyKey = (
  type: 'checkout' | 'payment_intent' | 'refund',
  primaryId: string, // eventId or paymentIntentId / chargeId depending on type
  secondaryId?: string | number, // userId or amount/full etc. optional
  opts?: {
    amount?: number;
    currency?: string;
  }
): string => {
  // Stripe Idempotency-Key は 1〜255 文字 (ASCII) に制限されるため、
  // keyComponent をコロンスプリットで連結した後に slice で truncate する。

  const prefix =
    type === 'payment_intent' ? 'pi' : type === 'refund' ? 'refund' : type; // 明示的に refund を保持

  const components: (string | number | undefined)[] = [prefix, primaryId];

  if (secondaryId !== undefined && secondaryId !== '') {
    components.push(secondaryId);
  }

  // 可変パラメータ（amount/currency）が指定されていれば追加
  if (opts?.amount !== undefined) {
    components.push(opts.amount);
  }
  if (opts?.currency) {
    components.push(opts.currency);
  }

  return components.join(':').slice(0, 255);
};

/**
 * Stripe API呼び出し用のオプション生成
 * idempotency_keyを含む共通オプションを提供
 */
export const createStripeRequestOptions = (
  idempotencyKey?: string
): Stripe.RequestOptions => {
  const options: Stripe.RequestOptions = {};

  if (idempotencyKey) {
    options.idempotencyKey = idempotencyKey;
  }

  return options;
};

// Stripe接続テスト
export const testStripeConnection = async (): Promise<{
  success: boolean;
  error?: string;
  accountId?: string;
}> => {
  try {
    // Stripeアカウント情報を取得してAPI接続をテスト
    const account = await stripe.accounts.retrieve();
    return {
      success: true,
      accountId: account.id,
    };
  } catch (error) {

    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

// Stripe Connect Express用の設定
export const stripeConnect = {
  createConnectAccount: async (userId: string, email: string) => {
    return await stripe.accounts.create({
      type: "express",
      country: "JP",
      email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: {
        user_id: userId,
      },
    });
  },

  createAccountLink: async (accountId: string, refreshUrl: string, returnUrl: string) => {
    return await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });
  },

  retrieveAccount: async (accountId: string) => {
    return await stripe.accounts.retrieve(accountId);
  },
};
