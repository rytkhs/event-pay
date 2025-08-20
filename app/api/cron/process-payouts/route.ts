import { NextRequest } from "next/server";
import { validateCronSecret, logCronActivity } from "@/lib/cron-auth";
import {
  createApiError,
  createErrorResponse,
  createSuccessResponse,
  ERROR_CODES,
} from "@/lib/utils/api-error";
import { PayoutService, PayoutErrorHandler } from "@/lib/services/payout";
import { PayoutValidator } from "@/lib/services/payout/validation";
import { StripeConnectService, StripeConnectErrorHandler } from "@/lib/services/stripe-connect";
import { PayoutScheduler } from "@/lib/services/payout/scheduler";
import type { CronExecutionData } from "@/lib/types/api-response";
import { SecureSupabaseClientFactory } from "@/lib/security/secure-client-factory.impl";
import { AdminReason } from "@/lib/security/secure-client-factory.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import {
  DEFAULT_PAYOUT_DAYS_AFTER_EVENT,
  DEFAULT_PAYOUT_MAX_EVENTS_PER_RUN,
  DEFAULT_PAYOUT_MAX_CONCURRENCY,
} from "@/lib/services/payout/constants";
import { FeeConfigService } from "@/lib/services/fee-config/service";
import { isDestinationChargesEnabled } from "@/lib/services/payment/feature-flags";

/**
 * 自動送金処理のCronエンドポイント
 *
 * 実行条件:
 * - イベント終了から5日経過
 * - Stripe決済の売上がある
 * - 主催者のStripe Connectアカウントが有効
 * - 未送金のイベント
 */
async function runPayoutProcessing(request: NextRequest) {
  const startTime = Date.now();

  try {
    // 機能フラグチェック: Destination chargesが有効な場合は自動送金を無効化
    if (isDestinationChargesEnabled()) {
      logCronActivity("info", "Cron job skipped: destination charges enabled");

      const data: CronExecutionData = {
        message: "自動送金は無効化されています。Destination chargesによる自動送金に移行済みです。",
        updatesCount: 0,
        skippedCount: 0,
        processingTime: Date.now() - startTime,
      };

      return createSuccessResponse(data);
    }

    // 1. 認証チェック
    logCronActivity("info", "Cron job started: process-payouts");

    const authResult = validateCronSecret(request);
    if (!authResult.isValid) {
      logCronActivity("error", "Authentication failed", { error: authResult.error });
      const error = createApiError(
        ERROR_CODES.UNAUTHORIZED,
        authResult.error || "Authentication failed"
      );
      return createErrorResponse(error, 401);
    }

    // 2. サービス初期化（監査付き管理者クライアントを使用）
    const secureFactory = SecureSupabaseClientFactory.getInstance();
    const adminClient = (await secureFactory.createAuditedAdminClient(
      AdminReason.PAYOUT_PROCESSING,
      "cron/process-payouts"
    )) as SupabaseClient<Database>;

    const stripeConnectService = new StripeConnectService(
      adminClient,
      new StripeConnectErrorHandler()
    );

    const validator = new PayoutValidator(adminClient, stripeConnectService);

    const payoutService = new PayoutService(
      adminClient,
      new PayoutErrorHandler(),
      stripeConnectService,
      validator
    );

    const scheduler = new PayoutScheduler(
      payoutService,
      stripeConnectService,
      adminClient
    );

    // 3. スケジューラーで一括実行（ロジックはPayoutSchedulerに集約）
    logCronActivity("info", "Executing payout scheduler via cron");

    // FeeConfigServiceから最小送金額を取得
    const feeConfigService = new FeeConfigService(adminClient);
    const { minPayoutAmount } = await feeConfigService.getConfig();

    const result = await scheduler.executeScheduledPayouts({
      daysAfterEvent: DEFAULT_PAYOUT_DAYS_AFTER_EVENT,
      minimumAmount: minPayoutAmount,
      maxEventsPerRun: DEFAULT_PAYOUT_MAX_EVENTS_PER_RUN,
      maxConcurrency: DEFAULT_PAYOUT_MAX_CONCURRENCY,
    });

    const processingTime = Date.now() - startTime;
    const hasFailures = result.failedPayouts > 0;

    logCronActivity(hasFailures ? "warning" : "success", "Payout processing completed", {
      eligibleEvents: result.eligibleEventsCount,
      successfulPayouts: result.successfulPayouts,
      failedPayouts: result.failedPayouts,
      processingTime,
    });

    const message =
      result.eligibleEventsCount === 0
        ? "No events eligible for payout processing"
        : hasFailures
          ? `Payout processing completed with ${result.failedPayouts} failures`
          : "Payout processing completed successfully";

    const data: CronExecutionData = {
      message,
      updatesCount: result.successfulPayouts,
      skippedCount: result.failedPayouts,
      processingTime,
    };

    return createSuccessResponse(data);

  } catch (error) {
    const processingTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    logCronActivity("error", "Payout processing failed with unexpected error", {
      error: errorMessage,
      processingTime,
    });

    const apiError = createApiError(
      ERROR_CODES.INTERNAL_ERROR,
      "Unexpected error occurred during payout processing",
      { originalError: errorMessage, processingTime }
    );

    return createErrorResponse(apiError, 500);
  }
}

/**
 * ヘルスチェック用GETエンドポイント
 */
export async function GET(request: NextRequest) {
  // Vercel CronはGETで叩くため、GETでも本処理を実行する
  return runPayoutProcessing(request);
}

export async function POST(request: NextRequest) {
  // 手動トリガー用（curlなど）
  return runPayoutProcessing(request);
}
