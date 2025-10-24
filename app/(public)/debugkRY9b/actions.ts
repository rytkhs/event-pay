"use server";

import { logger } from "@core/logging/app-logger";
import { validateRequiredEnvVars } from "@core/utils/env-helper";

/**
 * デバッグ用: すべての環境変数をvalidateRequiredEnvVarsでチェック
 */
export async function debugValidateAllEnvVars(): Promise<{
  success: boolean;
  message: string;
  envVars?: Record<string, string>;
  missingVars?: string[];
}> {
  try {
    // すべての環境変数をチェック
    const allEnvVars = [
      // Supabase
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",

      // Stripe
      "STRIPE_SECRET_KEY",
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "STRIPE_WEBHOOK_SECRET_SECONDARY",
      "STRIPE_WEBHOOK_SECRET_TEST",
      "STRIPE_WEBHOOK_SECRET_TEST_SECONDARY",
      "STRIPE_CONNECT_WEBHOOK_SECRET",
      "STRIPE_CONNECT_WEBHOOK_SECRET_SECONDARY",
      "STRIPE_CONNECT_WEBHOOK_SECRET_TEST",
      "STRIPE_CONNECT_WEBHOOK_SECRET_TEST_SECONDARY",

      // アプリ設定
      "NODE_ENV",
      "NEXT_PUBLIC_APP_URL",
      "APP_BASE_URL",
      "NEXTAUTH_URL",
      "AFTER_LOGIN_REDIRECT_PATH",

      // Redis/Upstash
      "UPSTASH_REDIS_REST_URL",
      "UPSTASH_REDIS_REST_TOKEN",

      // ログ設定
      "LOG_LEVEL",
      "PINO_LOG_LEVEL",

      // セキュリティ
      "CRON_SECRET",
      "RL_HMAC_SECRET",
      "RL_FAIL_CLOSED",
      "RL_FAIL_CLOSED_PUBLIC",

      // メール通知
      "RESEND_API_KEY",
      "FROM_EMAIL",
      "ADMIN_EMAIL",

      // QStash
      "QSTASH_URL",
      "QSTASH_TOKEN",
      "QSTASH_CURRENT_SIGNING_KEY",
      "QSTASH_NEXT_SIGNING_KEY",
      "SKIP_QSTASH_IN_TEST",

      // Stripe Connect
      "stripe_account_id",
      "INVOICE_REGISTRATION_NUMBER",
      "STRIPE_API_VERSION",
      "STRIPE_LOG_VERBOSE",
      "ENABLE_STRIPE_IP_CHECK",

      // デプロイ環境
      "VERCEL_ENV",
      "VERCEL_URL",
      "NEXT_PUBLIC_SITE_URL",

      // セキュリティ設定
      "ALLOWED_ORIGINS",
      "STRIPE_WEBHOOK_ALLOWED_IPS_EXTRA",
      "FORCE_SECURE_COOKIES",
      "COOKIE_DOMAIN",

      // その他
      "SLACK_CONTACT_WEBHOOK_URL",
      "PLATFORM_BALANCE_MIN_JPY",
      "STRIPE_WEBHOOK_TIMESTAMP_TOLERANCE",
    ];

    logger.info("デバッグ: 全環境変数のバリデーション開始", {
      tag: "debugEnvVars",
      total_vars: allEnvVars.length,
      vars: allEnvVars,
    });

    const envVars = validateRequiredEnvVars(allEnvVars);

    logger.info("デバッグ: 全環境変数のバリデーション成功", {
      tag: "debugEnvVars",
      validated_count: Object.keys(envVars).length,
      validated_vars: Object.keys(envVars),
    });

    return {
      success: true,
      message: `すべての環境変数が正常に設定されています (${Object.keys(envVars).length}個)`,
      envVars,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    logger.error("デバッグ: 環境変数バリデーション失敗", {
      tag: "debugEnvVars",
      error: errorMessage,
      error_type: error instanceof Error ? error.constructor.name : "Unknown",
    });

    return {
      success: false,
      message: `環境変数のバリデーションに失敗しました: ${errorMessage}`,
      missingVars: errorMessage.includes("Missing required environment variables")
        ? errorMessage.split(": ")[1]?.split(", ") || []
        : [],
    };
  }
}
