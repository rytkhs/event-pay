import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateCronSecret, logCronActivity } from "@/lib/cron-auth";
import {
  createApiError,
  createErrorResponse,
  createSuccessResponse,
  ERROR_CODES,
} from "@/lib/utils/api-error";
import { processBatch, getBatchSummary } from "@/lib/utils/batch-processor";
import { PayoutService, PayoutErrorHandler } from "@/lib/services/payout";
import { PayoutValidator } from "@/lib/services/payout/validation";
import { StripeConnectService } from "@/lib/services/stripe-connect";
import { PayoutScheduler } from "@/lib/services/payout/scheduler";
import type { CronExecutionData } from "@/lib/types/api-response";

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

    // 2. サービス初期化
    // Server-side Supabase client (reserved for future use)
    const _supabase = createClient();
    const stripeConnectService = new StripeConnectService(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const validator = new PayoutValidator(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      stripeConnectService
    );

    const payoutService = new PayoutService(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      new PayoutErrorHandler(),
      stripeConnectService,
      validator
    );

    const scheduler = new PayoutScheduler(payoutService, stripeConnectService);

    // 3. 送金対象イベントを検索
    logCronActivity("info", "Searching for eligible events");

    const eligibleEvents = await payoutService.findEligibleEvents({
      daysAfterEvent: 5,
      minimumAmount: 100, // 最小100円
      limit: 100, // 一度に最大100件処理
    });

    if (eligibleEvents.length === 0) {
      logCronActivity("info", "No eligible events found for payout processing");
      const data: CronExecutionData = {
        message: "No events eligible for payout processing",
        updatesCount: 0,
        processingTime: Date.now() - startTime,
      };
      return createSuccessResponse(data);
    }

    logCronActivity("info", `Found ${eligibleEvents.length} eligible events`, {
      eventIds: eligibleEvents.map(e => e.id),
      totalAmount: eligibleEvents.reduce((sum, e) => sum + e.total_stripe_sales, 0),
    });

    // 4. 送金処理を実行（バッチ処理で部分失敗に対応）
    let successfulPayouts = 0;
    let failedPayouts = 0;
    const payoutResults: import("@/lib/services/payout/types").SchedulerExecutionResult["results"] = [];

    const batchResult = await processBatch(
      eligibleEvents,
      async (event) => {
        try {
          // 送金可能性を再チェック
          const eligibility = await payoutService.checkPayoutEligibility(event.id, event.created_by);
          if (!eligibility.eligible) {
            logCronActivity("warning", `Event ${event.id} is no longer eligible`, {
              reason: eligibility.reason,
            });
            return {
              eventId: event.id,
              eventTitle: event.title,
              userId: event.created_by,
              success: false,
              error: eligibility.reason,
            };
          }

          // 送金処理実行
          const result = await payoutService.processPayout({
            eventId: event.id,
            userId: event.created_by,
            notes: "Automated payout via cron job",
          });

          logCronActivity("success", `Payout processed successfully`, {
            eventId: event.id,
            payoutId: result.payoutId,
            transferId: result.transferId,
            amount: result.netAmount,
          });

          return {
            eventId: event.id,
            eventTitle: event.title,
            userId: event.created_by,
            success: true,
            payoutId: result.payoutId,
            transferId: result.transferId ?? undefined,
            amount: result.netAmount,
            estimatedArrival: result.estimatedArrival,
          };

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";

          logCronActivity("error", `Failed to process payout for event ${event.id}`, {
            error: errorMessage,
            eventTitle: event.title,
            userId: event.created_by,
          });

          return {
            eventId: event.id,
            eventTitle: event.title,
            userId: event.created_by,
            success: false,
            error: errorMessage,
          };
        }
      },
      {
        continueOnError: true,
        maxConcurrency: 3, // Stripe API制限を考慮して3並列
      }
    );

    // 5. 結果集計
    const summary = getBatchSummary(batchResult);
    successfulPayouts = summary.successCount;
    failedPayouts = summary.failureCount;

    // 成功・失敗の詳細を記録
    batchResult.successful.forEach(result => {
      payoutResults.push(result.result);
    });

    batchResult.failed.forEach(result => {
      payoutResults.push({
        eventId: result.item.id,
        eventTitle: result.item.title,
        userId: result.item.created_by,
        success: false,
        error: result.error?.message || "Unknown error",
      });
    });

    // 6. 実行ログを記録
    await scheduler.logSchedulerExecution({
      executionId: `cron-${Date.now()}`,
      startTime: new Date(startTime),
      endTime: new Date(),
      eligibleEventsCount: eligibleEvents.length,
      successfulPayouts,
      failedPayouts,
      totalAmount: payoutResults
        .filter(r => r.success && r.amount)
        .reduce((sum, r) => sum + (r.amount || 0), 0),
      results: payoutResults,
      dryRun: false,
    });

    // 7. レスポンス作成
    const processingTime = Date.now() - startTime;
    const hasFailures = failedPayouts > 0;

    logCronActivity(hasFailures ? "warning" : "success", "Payout processing completed", {
      eligibleEvents: eligibleEvents.length,
      successfulPayouts,
      failedPayouts,
      processingTime,
    });

    const data: CronExecutionData = {
      message: hasFailures
        ? `Payout processing completed with ${failedPayouts} failures`
        : "Payout processing completed successfully",
      updatesCount: successfulPayouts,
      skippedCount: failedPayouts,
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
