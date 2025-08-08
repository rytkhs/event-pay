import Stripe from "stripe";

// 環境変数の検証
const requiredEnvVars = {
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
} as const;

// 環境変数の存在チェック（テスト環境では厳格チェックをスキップ）
const isTestEnv = process.env.NODE_ENV === "test";
if (!isTestEnv) {
  for (const [key, value] of Object.entries(requiredEnvVars)) {
    if (!value) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
}

// Stripeクライアントの初期化
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "STRIPE_SECRET_KEY_REDACTED", {
  apiVersion: process.env.STRIPE_API_VERSION as Stripe.LatestApiVersion | undefined,
  typescript: true,
  appInfo: {
    name: "EventPay",
    version: "1.0.0",
  },
});

/**
 * Webhook用のシークレット取得関数。
 * Webhook処理ルート以外では参照しないこと。
 * 未設定時は例外を投げる（起動時ではなく実行時に検出する）。
 */
export const getWebhookSecret = (): string => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is required for webhook processing");
  }
  return secret;
};

// Stripe設定の取得
export const stripeConfig = {
  secretKey: process.env.STRIPE_SECRET_KEY!,
  publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
} as const;

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
    console.error("Stripe connection test failed:", error);
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
      business_type: "individual",
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
