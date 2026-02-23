/**
 * リマインダー送信サービスの実装
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "date-fns";

import { logger } from "@core/logging/app-logger";
import { handleServerError } from "@core/utils/error-handler.server";
import { buildGuestUrl } from "@core/utils/guest-token";
import {
  getCurrentJstTime,
  formatUtcToJst,
  formatDateToJstYmd,
  convertJstDateToUtcRange,
} from "@core/utils/timezone";

import type { Database } from "@/types/database";

import { EmailNotificationService } from "./email-service";
import { buildEmailIdempotencyKey } from "./idempotency";
import {
  buildEventStartReminderTemplate,
  buildPaymentDeadlineReminderTemplate,
  buildResponseDeadlineReminderTemplate,
} from "./templates";
import type { IEmailNotificationService } from "./types";

/**
 * リマインダー送信結果のサマリー
 */
export interface ReminderSummary {
  reminderType: "response_deadline" | "payment_deadline" | "event_start";
  totalTargets: number;
  successCount: number;
  failureCount: number;
  errors: Array<{ attendanceId: string; error: string }>;
}

/**
 * 参加期限リマインダーの送信対象データ
 */
interface ResponseDeadlineTarget {
  id: string;
  email: string;
  nickname: string;
  guest_token: string;
  events: {
    id: string;
    title: string;
    date: string;
    location: string | null;
    registration_deadline: string;
  };
}

/**
 * 決済期限リマインダーの送信対象データ
 */
interface PaymentDeadlineTarget {
  id: string;
  email: string;
  nickname: string;
  guest_token: string;
  events: {
    id: string;
    title: string;
    date: string;
    location: string | null;
    fee: number;
    payment_deadline: string;
  };
}

/**
 * イベント開催リマインダーの送信対象データ
 */
interface EventStartTarget {
  id: string;
  email: string;
  nickname: string;
  guest_token: string;
  events: {
    id: string;
    title: string;
    date: string;
    location: string | null;
    description: string | null;
    fee: number;
  };
  payments: Array<{
    method: Database["public"]["Enums"]["payment_method_enum"];
    status: Database["public"]["Enums"]["payment_status_enum"];
  }> | null;
}

/**
 * リマインダー送信サービス
 */
export class ReminderService {
  private supabase: SupabaseClient<Database, "public">;
  private emailService: IEmailNotificationService;

  constructor(
    supabase: SupabaseClient<Database, "public">,
    emailService?: IEmailNotificationService
  ) {
    this.supabase = supabase;
    this.emailService = emailService || new EmailNotificationService();
  }

  /**
   * 構造化ロガー
   */
  private get logger() {
    return logger.withContext({
      category: "email",
      action: "reminder_service",
      actor_type: "system",
    });
  }

  /**
   * すべてのリマインダーを送信
   * 各リマインダー種別を並列実行して効率化
   */
  async sendAllReminders(): Promise<ReminderSummary[]> {
    // 3種のリマインダーを並列実行
    const [responseDeadline, paymentDeadline, eventStart] = await Promise.all([
      this.sendResponseDeadlineReminders(),
      this.sendPaymentDeadlineReminders(),
      this.sendEventStartReminders(),
    ]);

    return [responseDeadline, paymentDeadline, eventStart];
  }

  /**
   * 参加期限リマインダーを送信
   */
  async sendResponseDeadlineReminders(): Promise<ReminderSummary> {
    this.logger.info("Starting response deadline reminders", { outcome: "success" });

    try {
      // 翌日のJST範囲を取得
      const { start, end } = this.getTomorrowJstRange();

      // 送信対象を抽出
      const { data: targets, error } = await this.supabase
        .from("attendances")
        .select(
          `
          id,
          email,
          nickname,
          guest_token,
          events!inner (
            id,
            title,
            date,
            location,
            registration_deadline
          )
        `
        )
        .eq("status", "maybe")
        .gte("events.registration_deadline", start.toISOString())
        .lte("events.registration_deadline", end.toISOString())
        .is("events.canceled_at", null);

      if (error) {
        handleServerError("DATABASE_ERROR", {
          category: "email",
          action: "sendResponseDeadlineReminders",
          actorType: "system",
          additionalData: {
            error: error.message,
          },
        });
        return {
          reminderType: "response_deadline",
          totalTargets: 0,
          successCount: 0,
          failureCount: 0,
          errors: [{ attendanceId: "query", error: error.message }],
        };
      }

      const typedTargets = targets as ResponseDeadlineTarget[];

      this.logger.info("Response deadline targets fetched", {
        totalTargets: typedTargets.length,
        outcome: "success",
      });

      // バッチ送信
      const { successCount, failures } = await this.sendBatch(typedTargets, async (target) => {
        await this.sendResponseDeadlineEmail(target);
      });

      return {
        reminderType: "response_deadline",
        totalTargets: typedTargets.length,
        successCount,
        failureCount: failures.length,
        errors: failures.map((f) => ({
          attendanceId: f.target.id,
          error: f.error,
        })),
      };
    } catch (error) {
      handleServerError("CRON_EXECUTION_ERROR", {
        category: "email",
        action: "sendResponseDeadlineReminders",
        actorType: "system",
        additionalData: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
      return {
        reminderType: "response_deadline",
        totalTargets: 0,
        successCount: 0,
        failureCount: 0,
        errors: [
          {
            attendanceId: "unknown",
            error: error instanceof Error ? error.message : String(error),
          },
        ],
      };
    }
  }

  /**
   * 決済期限リマインダーを送信
   */
  async sendPaymentDeadlineReminders(): Promise<ReminderSummary> {
    this.logger.info("Starting payment deadline reminders", { outcome: "success" });

    try {
      // 翌日のJST範囲を取得
      const { start, end } = this.getTomorrowJstRange();

      // 送信対象を抽出
      const { data: targets, error } = await this.supabase
        .from("attendances")
        .select(
          `
          id,
          email,
          nickname,
          guest_token,
          events!inner (
            id,
            title,
            date,
            location,
            fee,
            payment_deadline
          ),
          payments!inner (
            id,
            method,
            status,
            paid_at,
            created_at
          )
        `
        )
        .eq("status", "attending")
        .eq("payments.method", "stripe")
        .eq("payments.status", "pending")
        .not("events.payment_deadline", "is", null)
        .gte("events.payment_deadline", start.toISOString())
        .lte("events.payment_deadline", end.toISOString())
        .is("events.canceled_at", null)
        .order("paid_at", { foreignTable: "payments", ascending: false, nullsFirst: false })
        .order("created_at", { foreignTable: "payments", ascending: false })
        .limit(1, { foreignTable: "payments" });

      if (error) {
        handleServerError("DATABASE_ERROR", {
          category: "email",
          action: "sendPaymentDeadlineReminders",
          actorType: "system",
          additionalData: {
            error: error.message,
          },
        });
        return {
          reminderType: "payment_deadline",
          totalTargets: 0,
          successCount: 0,
          failureCount: 0,
          errors: [{ attendanceId: "query", error: error.message }],
        };
      }

      const typedTargets = targets as PaymentDeadlineTarget[];

      this.logger.info("Payment deadline targets fetched", {
        totalTargets: typedTargets.length,
        outcome: "success",
      });

      // バッチ送信
      const { successCount, failures } = await this.sendBatch(typedTargets, async (target) => {
        await this.sendPaymentDeadlineEmail(target);
      });

      return {
        reminderType: "payment_deadline",
        totalTargets: typedTargets.length,
        successCount,
        failureCount: failures.length,
        errors: failures.map((f) => ({
          attendanceId: f.target.id,
          error: f.error,
        })),
      };
    } catch (error) {
      handleServerError("CRON_EXECUTION_ERROR", {
        category: "email",
        action: "sendPaymentDeadlineReminders",
        actorType: "system",
        additionalData: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
      return {
        reminderType: "payment_deadline",
        totalTargets: 0,
        successCount: 0,
        failureCount: 0,
        errors: [
          {
            attendanceId: "unknown",
            error: error instanceof Error ? error.message : String(error),
          },
        ],
      };
    }
  }

  /**
   * イベント開催リマインダーを送信
   */
  async sendEventStartReminders(): Promise<ReminderSummary> {
    this.logger.info("Starting event start reminders", { outcome: "success" });

    try {
      // 翌日のJST範囲を取得
      const { start, end } = this.getTomorrowJstRange();

      // 送信対象を抽出
      const { data: targets, error } = await this.supabase
        .from("attendances")
        .select(
          `
          id,
          email,
          nickname,
          guest_token,
          events!inner (
            id,
            title,
            date,
            location,
            description,
            fee
          ),
          payments (
            method,
            status,
            paid_at,
            created_at
          )
        `
        )
        .eq("status", "attending")
        .gte("events.date", start.toISOString())
        .lte("events.date", end.toISOString())
        .is("events.canceled_at", null)
        .order("paid_at", { foreignTable: "payments", ascending: false, nullsFirst: false })
        .order("created_at", { foreignTable: "payments", ascending: false })
        .limit(1, { foreignTable: "payments" });

      if (error) {
        handleServerError("DATABASE_ERROR", {
          category: "email",
          action: "sendEventStartReminders",
          actorType: "system",
          additionalData: {
            error: error.message,
          },
        });
        return {
          reminderType: "event_start",
          totalTargets: 0,
          successCount: 0,
          failureCount: 0,
          errors: [{ attendanceId: "query", error: error.message }],
        };
      }

      const typedTargets = targets as EventStartTarget[];

      this.logger.info("Event start targets fetched", {
        totalTargets: typedTargets.length,
        outcome: "success",
      });

      // バッチ送信
      const { successCount, failures } = await this.sendBatch(typedTargets, async (target) => {
        await this.sendEventStartEmail(target);
      });

      return {
        reminderType: "event_start",
        totalTargets: typedTargets.length,
        successCount,
        failureCount: failures.length,
        errors: failures.map((f) => ({
          attendanceId: f.target.id,
          error: f.error,
        })),
      };
    } catch (error) {
      handleServerError("CRON_EXECUTION_ERROR", {
        category: "email",
        action: "sendEventStartReminders",
        actorType: "system",
        additionalData: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
      return {
        reminderType: "event_start",
        totalTargets: 0,
        successCount: 0,
        failureCount: 0,
        errors: [
          {
            attendanceId: "unknown",
            error: error instanceof Error ? error.message : String(error),
          },
        ],
      };
    }
  }

  /**
   * 参加期限リマインダーメールを送信
   */
  private async sendResponseDeadlineEmail(target: ResponseDeadlineTarget): Promise<void> {
    const guestUrl = buildGuestUrl(target.guest_token);

    const result = await this.emailService.sendEmail({
      to: target.email,
      template: buildResponseDeadlineReminderTemplate({
        nickname: target.nickname,
        eventTitle: target.events.title,
        eventDate: formatUtcToJst(target.events.date, "yyyy/MM/dd HH:mm"),
        eventLocation: target.events.location,
        responseDeadline: formatUtcToJst(target.events.registration_deadline, "yyyy/MM/dd HH:mm"),
        guestUrl,
      }),
      idempotencyKey: buildEmailIdempotencyKey({
        scope: "response-deadline-reminder",
        parts: [target.id, target.events.id, target.events.registration_deadline],
      }),
    });

    if (!result.success) {
      throw result.error;
    }
  }

  /**
   * 決済期限リマインダーメールを送信
   */
  private async sendPaymentDeadlineEmail(target: PaymentDeadlineTarget): Promise<void> {
    const guestUrl = buildGuestUrl(target.guest_token);

    const result = await this.emailService.sendEmail({
      to: target.email,
      template: buildPaymentDeadlineReminderTemplate({
        nickname: target.nickname,
        eventTitle: target.events.title,
        eventDate: target.events.date,
        eventLocation: target.events.location,
        participationFee: target.events.fee,
        paymentDeadline: target.events.payment_deadline,
        paymentUrl: guestUrl,
      }),
      idempotencyKey: buildEmailIdempotencyKey({
        scope: "payment-deadline-reminder",
        parts: [target.id, target.events.id, target.events.payment_deadline],
      }),
    });

    if (!result.success) {
      throw result.error;
    }
  }

  /**
   * イベント開催リマインダーメールを送信
   */
  private async sendEventStartEmail(target: EventStartTarget): Promise<void> {
    const guestUrl = buildGuestUrl(target.guest_token);

    const result = await this.emailService.sendEmail({
      to: target.email,
      template: buildEventStartReminderTemplate({
        nickname: target.nickname,
        eventTitle: target.events.title,
        eventDate: target.events.date,
        eventLocation: target.events.location,
        eventDescription: target.events.description,
        guestUrl,
      }),
      idempotencyKey: buildEmailIdempotencyKey({
        scope: "event-start-reminder",
        parts: [target.id, target.events.id, target.events.date],
      }),
    });

    if (!result.success) {
      throw result.error;
    }
  }

  /**
   * 翌日のJST日付範囲を取得（UTC境界で正確に比較するため）
   */
  private getTomorrowJstRange(): { start: Date; end: Date } {
    const nowJst = getCurrentJstTime();
    const tomorrowJst = addDays(nowJst, 1);
    const jstYmd = formatDateToJstYmd(tomorrowJst); // 'YYYY-MM-DD'形式

    // JST日付の00:00:00〜23:59:59.999をUTC範囲に変換
    const { startOfDay, endOfDay } = convertJstDateToUtcRange(jstYmd);

    return { start: startOfDay, end: endOfDay };
  }

  /**
   * バッチ送信処理
   */
  private async sendBatch<T extends { id: string; events: { id: string } }>(
    targets: T[],
    sendFn: (target: T) => Promise<void>,
    batchSize: number = 50
  ): Promise<{ successCount: number; failures: Array<{ target: T; error: string }> }> {
    let successCount = 0;
    const failures: Array<{ target: T; error: string }> = [];

    for (let i = 0; i < targets.length; i += batchSize) {
      const batch = targets.slice(i, i + batchSize);

      for (const target of batch) {
        try {
          await sendFn(target);
          successCount++;
          this.logger.info("Reminder sent successfully", {
            attendanceId: target.id,
            eventId: target.events.id,
            outcome: "success",
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          failures.push({ target, error: errorMessage });
          handleServerError("EMAIL_SENDING_FAILED", {
            category: "email",
            action: "sendBatch",
            actorType: "system",
            additionalData: {
              attendanceId: target.id,
              eventId: target.events.id,
              error: errorMessage,
            },
          });
        }
      }

      // バッチ間の待機時間（レート制限対策）
      if (i + batchSize < targets.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return { successCount, failures };
  }
}
