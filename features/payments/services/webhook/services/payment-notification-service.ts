import { NotificationService } from "@core/notification/service";
import type { AppSupabaseClient } from "@core/types/supabase";
import { handleServerError } from "@core/utils/error-handler.server";

import type { WebhookContextLogger } from "../context/webhook-handler-context";

interface PaymentNotificationServiceParams {
  supabase: AppSupabaseClient;
  logger: WebhookContextLogger;
}

interface SendPaymentCompletedNotificationParams {
  paymentId: string;
  attendanceId: string;
  amount: number;
  receiptUrl: string | null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getEventObjectFromRelation(value: unknown): Record<string, unknown> | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return isRecord(candidate) ? candidate : null;
}

function extractPaymentNotificationDataFromAttendance(
  attendance: unknown
): { email: string; nickname: string; eventTitle: string } | null {
  if (!isRecord(attendance)) {
    return null;
  }

  const email = attendance.email;
  const nickname = attendance.nickname;
  const eventObject = getEventObjectFromRelation(attendance.event);
  const eventTitle = eventObject?.title;

  if (!isNonEmptyString(email) || !isNonEmptyString(nickname) || !isNonEmptyString(eventTitle)) {
    return null;
  }

  return { email, nickname, eventTitle };
}

export class PaymentNotificationService {
  private readonly supabase: AppSupabaseClient;
  private readonly logger: WebhookContextLogger;

  constructor(params: PaymentNotificationServiceParams) {
    this.supabase = params.supabase;
    this.logger = params.logger;
  }

  async sendPaymentCompletedNotification(
    params: SendPaymentCompletedNotificationParams
  ): Promise<void> {
    try {
      const { data: attendance, error: fetchError } = await this.supabase
        .from("attendances")
        .select("email, nickname, event:events(title)")
        .eq("id", params.attendanceId)
        .single();

      if (fetchError || !attendance) {
        this.logger.warn("Failed to fetch attendance for payment notification", {
          paymentId: params.paymentId,
          attendanceId: params.attendanceId,
          error_message: fetchError?.message || "Attendance not found",
          outcome: "failure",
        });
        return;
      }

      const notificationData = extractPaymentNotificationDataFromAttendance(attendance);
      if (!notificationData) {
        this.logger.warn("Invalid attendance payload for payment notification", {
          paymentId: params.paymentId,
          attendanceId: params.attendanceId,
          outcome: "failure",
        });
        return;
      }

      const notificationService = new NotificationService(this.supabase);
      await notificationService.sendPaymentCompletedNotification({
        email: notificationData.email,
        nickname: notificationData.nickname,
        eventTitle: notificationData.eventTitle,
        amount: params.amount,
        paidAt: new Date().toISOString(),
        receiptUrl: params.receiptUrl ?? undefined,
      });
    } catch (error) {
      handleServerError("PAYMENT_COMPLETION_NOTIFICATION_FAILED", {
        action: "sendPaymentCompletedNotification",
        additionalData: {
          paymentId: params.paymentId,
          error_message: error instanceof Error ? error.message : "Unknown error",
        },
      });
    }
  }
}
