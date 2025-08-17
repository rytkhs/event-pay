import Stripe from "stripe";
import { logger } from "@/lib/logging/app-logger";

// 環境変数の検証
const requiredEnvVars = {
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
} as const;

// 環境変数の存在チェック（環境・テスト問わず必須）
for (const [key, value] of Object.entries(requiredEnvVars)) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

// Stripeクライアントの初期化（Destination charges対応）
const stripeSecretKey = process.env.STRIPE_SECRET_KEY!;
export const stripe = new Stripe(stripeSecretKey, {
  // API バージョンを固定（Destination charges対応）
  apiVersion: "2025-07-30.basil",
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
if (!hasRegisteredHooks) {
  (global as unknown as { __stripeHooks?: boolean }).__stripeHooks = true;

  // Stripe request hook
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - stripe typings don't expose "request" event yet
  stripe.on("request", (req: Record<string, unknown>) => {
    logger.info("stripe_request", {
      request_id: req.requestId as string | undefined,
      idempotency_key: req.idempotencyKey as string | undefined,
      method: req.method as string | undefined,
      path: req.path as string | undefined,
      stripe_account: req.stripeAccount as string | undefined,
    });
  });

  // Stripe response hook
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - stripe typings don't expose "response" event yet
  stripe.on("response", (res: Record<string, unknown>) => {
    logger.info("stripe_response", {
      request_id: res.requestId as string | undefined,
      status: res.statusCode as number | undefined,
      latency_ms: res.elapsed as number | undefined,
      stripe_should_retry: (res.headers as Record<string, unknown> | undefined)?.["stripe-should-retry"] as string | undefined,
    });
  });
}

/**
 * Webhook用のシークレット取得関数。
 * Webhook処理ルート以外では参照しないこと。
 * 未設定時は例外を投げる（起動時ではなく実行時に検出する）。
 */
export const getWebhookSecret = (): string => {
  // 環境に応じてシークレットを切替（優先順: 本番→テスト → 互換）
  const isProd = process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
  const prod = process.env.STRIPE_WEBHOOK_SECRET;
  const test = process.env.STRIPE_WEBHOOK_SECRET_TEST;
  const secret = isProd ? prod : (test ?? prod);
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET/STRIPE_WEBHOOK_SECRET_TEST is required for webhook processing");
  }
  return secret;
};

// Stripe設定の取得
export const stripeConfig = {
  secretKey: process.env.STRIPE_SECRET_KEY!,
  publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
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
