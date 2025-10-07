import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createProblemResponse } from "@core/api/problem-details";
import { validateCronSecret } from "@core/cron-auth";
import { logger } from "@core/logging/app-logger";
import { EmailNotificationService } from "@core/notification/email-service";
import { ReminderService } from "@core/notification/reminder-service";
import { createClient } from "@core/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * リマインダー送信Cronジョブ
 * - 毎日 JST 9:00 (UTC 0:00) に実行
 * - 参加期限、決済期限、イベント開催の各リマインダーを送信
 */
export async function GET(request: NextRequest) {
  // 認証チェック
  const auth = validateCronSecret(request);
  if (!auth.isValid) {
    logger.warn("Unauthorized cron request", { error: auth.error });
    return createProblemResponse("UNAUTHORIZED", {
      instance: "/api/cron/send-reminders",
      detail: auth.error || "Unauthorized",
    });
  }

  try {
    logger.info("Starting reminder cron job");

    const supabase = createClient();
    const reminderService = new ReminderService(supabase);

    // すべてのリマインダーを送信
    const summaries = await reminderService.sendAllReminders();

    // 送信結果の集計
    const totalSent = summaries.reduce((sum, s) => sum + s.successCount, 0);
    const totalFailed = summaries.reduce((sum, s) => sum + s.failureCount, 0);

    logger.info("Reminder cron job completed", {
      summaries,
      totalSent,
      totalFailed,
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

      logger.warn("High failure rate detected, admin alert sent", {
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
    logger.error("Reminder cron job failed", { error });
    return createProblemResponse("INTERNAL_SERVER_ERROR", {
      instance: "/api/cron/send-reminders",
      detail: "Failed to send reminders",
    });
  }
}
