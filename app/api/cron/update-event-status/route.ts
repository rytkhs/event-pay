import { NextRequest, NextResponse } from "next/server";
import { SecureSupabaseClientFactory } from "@/lib/security/secure-client-factory.impl";
import { AdminReason } from "@/lib/security/secure-client-factory.types";
import { validateCronSecret, logCronActivity } from "@/lib/cron-auth";
import { updateEventStatus, getCurrentTime } from "@/lib/event-status-updater";
import { EVENT_CONFIG } from "@/lib/constants/event-config";
import { createProblemResponse } from "@/lib/api/problem-details";
import { processBatch, getBatchSummary } from "@/lib/utils/batch-processor";
interface CronExecutionData {
  message: string;
  updatesCount: number;
  processingTime: number;
  skippedCount: number;
  updates: Array<{ id: string }>;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // 1. 認証チェック
    logCronActivity("info", "Cron job started: update-event-status");

    const authResult = validateCronSecret(request);
    if (!authResult.isValid) {
      logCronActivity("error", "Authentication failed", { error: authResult.error });
      return createProblemResponse("UNAUTHORIZED", {
        instance: "/api/cron/update-event-status",
        detail: authResult.error || "Authentication failed",
      });
    }

    // 2. 監査付きadminクライアント作成
    const secureClientFactory = SecureSupabaseClientFactory.getInstance();
    const supabase = await secureClientFactory.createAuditedAdminClient(
      AdminReason.SYSTEM_MAINTENANCE,
      "Automated event status update via cron job"
    );

    // 3. 対象イベントを取得
    const { data: events, error: fetchError } = await supabase
      .from("events")
      .select("id, status, date")
      .in("status", EVENT_CONFIG.UPDATABLE_STATUSES); // 更新対象のステータスのみ

    if (fetchError) {
      logCronActivity("error", "Failed to fetch events", { error: fetchError });
      return createProblemResponse("DATABASE_ERROR", {
        instance: "/api/cron/update-event-status",
        detail: "Failed to fetch events",
      });
    }

    if (!events || events.length === 0) {
      logCronActivity("info", "No events found for status update");
      const data: CronExecutionData = {
        message: "No events to update",
        updatesCount: 0,
        processingTime: Date.now() - startTime,
        skippedCount: 0,
        updates: [],
      };
      return NextResponse.json(data);
    }

    // 4. ステータス更新ロジックを実行
    const currentTime = getCurrentTime();
    const updateResult = updateEventStatus(events, currentTime);

    // 5. データベース更新を実行（バッチ処理で部分失敗に対応）
    let actualUpdatesCount = 0;
    const failedUpdates: string[] = [];

    if (updateResult.updatesCount > 0) {
      const batchResult = await processBatch(
        updateResult.updates,
        async (update) => {
          const { error } = await supabase
            .from("events")
            .update({ status: update.newStatus })
            .eq("id", update.id);

          if (error) {
            logCronActivity("error", `Failed to update event ${update.id}`, { error });
            throw error;
          }

          logCronActivity("info", `Event status updated: ${update.id}`, {
            from: update.oldStatus,
            to: update.newStatus,
            reason: update.reason,
          });

          return { id: update.id, updated: true };
        },
        { continueOnError: true, maxConcurrency: 3 } // 部分失敗でも継続、最大3並列
      );

      const summary = getBatchSummary(batchResult);
      actualUpdatesCount = summary.successCount;

      // 失敗したイベントIDをログに記録
      if (batchResult.failed.length > 0) {
        const failedIds = batchResult.failed.map((f) => f.item.id);
        failedUpdates.push(...failedIds);
        logCronActivity("warning", "Some events failed to update", {
          failedEventIds: failedIds,
          failureCount: summary.failureCount,
          successCount: summary.successCount,
          successRate: summary.successRate,
        });
      }
    }

    // 6. 成功レスポンス（部分失敗を含む）
    const processingTime = Date.now() - startTime;
    const hasFailures = failedUpdates.length > 0;

    logCronActivity(hasFailures ? "warning" : "success", "Cron job completed", {
      plannedUpdates: updateResult.updatesCount,
      actualUpdates: actualUpdatesCount,
      failedUpdates: failedUpdates.length,
      skippedCount: updateResult.skipped.length,
      processingTime,
    });

    const data: CronExecutionData = {
      message: hasFailures
        ? `Event status update completed with ${failedUpdates.length} failures`
        : "Event status update completed successfully",
      updatesCount: actualUpdatesCount,
      skippedCount: updateResult.skipped.length,
      updates: updateResult.updates.filter((update) => !failedUpdates.includes(update.id)),
      processingTime,
    };

    return NextResponse.json(data);
  } catch (error) {
    const processingTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    logCronActivity("error", "Cron job failed with unexpected error", {
      error: errorMessage,
      processingTime,
    });

    return createProblemResponse("INTERNAL_ERROR", {
      instance: "/api/cron/update-event-status",
      detail: "Unexpected error occurred during event status update",
    });
  }
}

// GET メソッドも作成（ヘルスチェック用）
export async function GET(request: NextRequest) {
  // Vercel CronはGETで叩くため、GETでも本処理を実行する
  return POST(request);
}
