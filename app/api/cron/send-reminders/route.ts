import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createProblemResponse } from "@core/api/problem-details";
import { validateCronSecret } from "@core/cron-auth";
import { logger } from "@core/logging/app-logger";
import { logEmail } from "@core/logging/system-logger";
import { EmailNotificationService } from "@core/notification/email-service";
import { ReminderService } from "@core/notification/reminder-service";
import { getSecureClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import { handleServerError } from "@core/utils/error-handler.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * リマインダー送信Cronジョブ
 * - 毎日 JST 9:00 (UTC 0:00) に実行
 * - 参加期限、決済期限、イベント開催の各リマインダーを送信
 */
export async function GET(request: NextRequest) {
  const cronLogger = logger.withContext({
    category: "system",
    action: "reminder_cron",
    actor_type: "system",
  });

  // 認証チェック
  const auth = validateCronSecret(request);
  if (!auth.isValid) {
    cronLogger.warn("Unauthorized cron request", {
      action: "reminder_cron_auth_fail",
      error: auth.error,
      outcome: "failure",
    });
    return createProblemResponse("UNAUTHORIZED", {
      instance: "/api/cron/send-reminders",
      detail: auth.error || "Unauthorized",
    });
  }

  try {
    cronLogger.info("Starting reminder cron job");

    // RLSを回避するため管理者クライアントを使用
    const clientFactory = getSecureClientFactory();
    const supabase = await clientFactory.createAuditedAdminClient(
      AdminReason.REMINDER_PROCESSING,
      "cron:send-reminders - automated reminder email sending for deadlines and events",
      {
        operationType: "SELECT",
        accessedTables: ["attendances", "events", "payments"],
        additionalInfo: {
          cronPath: "/api/cron/send-reminders",
          executionTime: new Date().toISOString(),
          reminderTypes: ["response_deadline", "payment_deadline", "event_start"],
        },
      }
    );

    const reminderService = new ReminderService(supabase);

    // すべてのリマインダーを並列送信
    const summaries = await reminderService.sendAllReminders();

    // 送信結果の集計
    const totalSent = summaries.reduce((sum, s) => sum + s.successCount, 0);
    const totalFailed = summaries.reduce((sum, s) => sum + s.failureCount, 0);

    cronLogger.info("Reminder cron job completed", {
      summaries,
      totalSent,
      totalFailed,
      outcome: "success",
    });

    // 監査ログ記録
    await logEmail({
      action: "email.reminder_batch",
      message: `Reminder cron job completed`,
      actor_type: "system",
      outcome: "success",
      metadata: {
        total_sent: totalSent,
        total_failed: totalFailed,
        summaries: summaries,
      },
    });

    // 失敗率が10%を超えた場合、管理者にアラート
    const totalAttempts = totalSent + totalFailed;
    const failureRate = totalAttempts > 0 ? totalFailed / totalAttempts : 0;
    if (failureRate > 0.1 && totalFailed > 0) {
      const emailService = new EmailNotificationService();
      await emailService.sendAdminAlert({
        subject: "リマインダー送信で高い失敗率を検出",
        message: `リマインダー送信の失敗率が${(failureRate * 100).toFixed(1)}%を超えました。`,
        details: {
          totalSent,
          totalFailed,
          failureRate: `${(failureRate * 100).toFixed(1)}%`,
          summaries,
        },
      });

      cronLogger.warn("High failure rate detected, admin alert sent", {
        category: "email",
        action: "high_failure_rate_alert",
        failureRate: `${(failureRate * 100).toFixed(1)}%`,
      });
    }

    return NextResponse.json({
      success: true,
      summaries,
      totalSent,
      totalFailed,
    });
  } catch (error) {
    handleServerError("CRON_EXECUTION_ERROR", {
      category: "system",
      action: "reminder_cron_failed",
      additionalData: {
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      },
    });
    return createProblemResponse("INTERNAL_SERVER_ERROR", {
      instance: "/api/cron/send-reminders",
      detail: "Failed to send reminders",
    });
  }
}
