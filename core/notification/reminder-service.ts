/**
 * リマインダー送信サービスの実装
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, startOfDay, endOfDay } from "date-fns";

import { logger } from "@core/logging/app-logger";
import { getCurrentJstTime, formatUtcToJst } from "@core/utils/timezone";

import type { Database } from "@/types/database";

import { EmailNotificationService } from "./email-service";
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

  constructor(supabase: SupabaseClient<Database, "public">) {
    this.supabase = supabase;
    this.emailService = new EmailNotificationService();
  }

  /**
   * すべてのリマインダーを送信
   */
  async sendAllReminders(): Promise<ReminderSummary[]> {
    const summaries: ReminderSummary[] = [];

    // 各リマインダーを順次実行
    summaries.push(await this.sendResponseDeadlineReminders());
    summaries.push(await this.sendPaymentDeadlineReminders());
    summaries.push(await this.sendEventStartReminders());

    return summaries;
  }

  /**
   * 参加期限リマインダーを送信
   */
  async sendResponseDeadlineReminders(): Promise<ReminderSummary> {
    logger.info("Starting response deadline reminders");

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
        .not("events.registration_deadline", "is", null)
        .gte("events.registration_deadline", start.toISOString())
        .lte("events.registration_deadline", end.toISOString())
        .is("events.canceled_at", null);

      if (error) {
        logger.error("Failed to fetch response deadline targets", { error });
        return {
          reminderType: "response_deadline",
          totalTargets: 0,
          successCount: 0,
          failureCount: 0,
          errors: [{ attendanceId: "query", error: error.message }],
        };
      }

      const typedTargets = targets as unknown as ResponseDeadlineTarget[];

      logger.info("Response deadline targets fetched", {
        totalTargets: typedTargets.length,
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
      logger.error("Response deadline reminders failed", { error });
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
    logger.info("Starting payment deadline reminders");

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
        .order("created_at", { foreignTable: "payments", ascending: false });

      if (error) {
        logger.error("Failed to fetch payment deadline targets", { error });
        return {
          reminderType: "payment_deadline",
          totalTargets: 0,
          successCount: 0,
          failureCount: 0,
          errors: [{ attendanceId: "query", error: error.message }],
        };
      }

      // 各attendanceの最新の決済レコードのみを取得（クライアント側でフィルタリング）
      const uniqueTargets = new Map<string, PaymentDeadlineTarget>();
      for (const target of targets as any[]) {
        if (!uniqueTargets.has(target.id)) {
          uniqueTargets.set(target.id, target as PaymentDeadlineTarget);
        }
      }
      const typedTargets = Array.from(uniqueTargets.values());

      logger.info("Payment deadline targets fetched", {
        totalTargets: typedTargets.length,
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
      logger.error("Payment deadline reminders failed", { error });
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
    logger.info("Starting event start reminders");

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
        .order("created_at", { foreignTable: "payments", ascending: false });

      if (error) {
        logger.error("Failed to fetch event start targets", { error });
        return {
          reminderType: "event_start",
          totalTargets: 0,
          successCount: 0,
          failureCount: 0,
          errors: [{ attendanceId: "query", error: error.message }],
        };
      }

      // 各attendanceの最新の決済レコードのみを取得（クライアント側でフィルタリング）
      const uniqueTargets = new Map<string, EventStartTarget>();
      for (const target of targets as any[]) {
        if (!uniqueTargets.has(target.id)) {
          // paymentsが配列の場合は最初の要素のみを保持
          const processedTarget = {
            ...target,
            payments:
              target.payments && Array.isArray(target.payments)
                ? target.payments.slice(0, 1)
                : target.payments,
          };
          uniqueTargets.set(target.id, processedTarget as EventStartTarget);
        }
      }
      const typedTargets = Array.from(uniqueTargets.values());

      logger.info("Event start targets fetched", {
        totalTargets: typedTargets.length,
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
      logger.error("Event start reminders failed", { error });
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
    const { default: ResponseDeadlineReminderEmail } = await import(
      "@/emails/reminders/ResponseDeadlineReminderEmail"
    );

    const guestUrl = this.generateGuestUrl(target.events.id, target.guest_token);

    const result = await this.emailService.sendEmail({
      to: target.email,
      template: {
        subject: `【みんなの集金】${target.events.title} 参加期限のリマインダー`,
        react: ResponseDeadlineReminderEmail({
          nickname: target.nickname,
          eventTitle: target.events.title,
          eventDate: formatUtcToJst(target.events.date, "yyyy/MM/dd HH:mm"),
          eventLocation: target.events.location,
          responseDeadline: formatUtcToJst(target.events.registration_deadline, "yyyy/MM/dd HH:mm"),
          guestUrl,
        }),
      },
    });

    if (!result.success) {
      throw new Error(result.error || "Failed to send email");
    }
  }

  /**
   * 決済期限リマインダーメールを送信
   */
  private async sendPaymentDeadlineEmail(target: PaymentDeadlineTarget): Promise<void> {
    const { default: PaymentDeadlineReminderEmail } = await import(
      "@/emails/reminders/PaymentDeadlineReminderEmail"
    );

    const guestUrl = this.generateGuestUrl(target.events.id, target.guest_token);

    const result = await this.emailService.sendEmail({
      to: target.email,
      template: {
        subject: `【みんなの集金】${target.events.title} 決済期限のリマインダー`,
        react: PaymentDeadlineReminderEmail({
          nickname: target.nickname,
          eventTitle: target.events.title,
          eventDate: formatUtcToJst(target.events.date, "yyyy/MM/dd HH:mm"),
          eventLocation: target.events.location,
          participationFee: target.events.fee,
          paymentDeadline: formatUtcToJst(target.events.payment_deadline, "yyyy/MM/dd HH:mm"),
          paymentUrl: guestUrl,
        }),
      },
    });

    if (!result.success) {
      throw new Error(result.error || "Failed to send email");
    }
  }

  /**
   * イベント開催リマインダーメールを送信
   */
  private async sendEventStartEmail(target: EventStartTarget): Promise<void> {
    const { default: EventStartReminderEmail } = await import(
      "@/emails/reminders/EventStartReminderEmail"
    );

    const guestUrl = this.generateGuestUrl(target.events.id, target.guest_token);

    // 決済ステータスを判定
    let paymentStatus: "paid" | "cash" | "unpaid" = "unpaid";
    if (target.payments && target.payments.length > 0) {
      const payment = target.payments[0];
      if (payment.status === "paid") {
        paymentStatus = "paid";
      } else if (payment.method === "cash") {
        paymentStatus = "cash";
      }
    }

    const result = await this.emailService.sendEmail({
      to: target.email,
      template: {
        subject: `【みんなの集金】${target.events.title} 開催のリマインダー`,
        react: EventStartReminderEmail({
          nickname: target.nickname,
          eventTitle: target.events.title,
          eventDate: formatUtcToJst(target.events.date, "yyyy/MM/dd HH:mm"),
          eventLocation: target.events.location,
          eventDescription: target.events.description,
          participationFee: target.events.fee,
          paymentStatus,
          guestUrl,
        }),
      },
    });

    if (!result.success) {
      throw new Error(result.error || "Failed to send email");
    }
  }

  /**
   * 翌日のJST日付範囲を取得
   */
  private getTomorrowJstRange(): { start: Date; end: Date } {
    const nowJst = getCurrentJstTime();
    const tomorrowJst = addDays(nowJst, 1);

    const start = startOfDay(tomorrowJst);
    const end = endOfDay(tomorrowJst);

    return { start, end };
  }

  /**
   * バッチ送信処理
   */
  private async sendBatch<T>(
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
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          failures.push({ target, error: errorMessage });
          logger.error("Failed to send reminder", { error: errorMessage });
        }
      }

      // バッチ間の待機時間（レート制限対策）
      if (i + batchSize < targets.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return { successCount, failures };
  }

  /**
   * ゲスト用URLを生成
   */
  private generateGuestUrl(eventId: string, guestToken: string): string {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://event-pay.vercel.app";
    return `${baseUrl}/guest/${eventId}?token=${guestToken}`;
  }
}
