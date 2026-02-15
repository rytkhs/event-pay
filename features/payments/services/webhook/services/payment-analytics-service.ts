import type { AppSupabaseClient } from "@core/types/supabase";
import { handleServerError } from "@core/utils/error-handler.server";

import { paymentAnalytics } from "../../analytics/payment-analytics";
import type { WebhookContextLogger } from "../context/webhook-handler-context";

interface PaymentAnalyticsWebhookServiceParams {
  supabase: AppSupabaseClient;
  logger: WebhookContextLogger;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractEventFromAttendance(attendance: unknown): { id: string; title: string } | null {
  if (!isRecord(attendance)) {
    return null;
  }

  const rawEvent = attendance.event;
  const event = Array.isArray(rawEvent) ? rawEvent[0] : rawEvent;
  if (!isRecord(event)) {
    return null;
  }

  const eventId = event.id;
  const eventTitle = event.title;
  if (!isNonEmptyString(eventId) || !isNonEmptyString(eventTitle)) {
    return null;
  }

  return { id: eventId, title: eventTitle };
}

export class PaymentAnalyticsWebhookService {
  private readonly supabase: AppSupabaseClient;
  private readonly logger: WebhookContextLogger;

  constructor(params: PaymentAnalyticsWebhookServiceParams) {
    this.supabase = params.supabase;
    this.logger = params.logger;
  }

  async trackCheckoutCompletion(params: {
    paymentId: string;
    attendanceId: string;
    sessionId: string;
    gaClientId: string;
    amount: number;
  }): Promise<void> {
    const { paymentId, attendanceId, sessionId, gaClientId, amount } = params;

    try {
      const { data: attendance, error: attendanceError } = await this.supabase
        .from("attendances")
        .select("event:events(id, title)")
        .eq("id", attendanceId)
        .single();

      if (attendanceError || !attendance) {
        handleServerError("GA4_TRACKING_FAILED", {
          action: "fetchEventInfoForGa4",
          additionalData: {
            payment_id: paymentId,
            attendance_id: attendanceId,
            error_message: attendanceError?.message || "Attendance not found",
          },
        });
        return;
      }

      const eventData = extractEventFromAttendance(attendance);
      if (!eventData) {
        handleServerError("GA4_TRACKING_FAILED", {
          action: "fetchEventInfoForGa4",
          additionalData: {
            payment_id: paymentId,
            attendance_id: attendanceId,
            error_message: "Invalid attendance event payload",
          },
        });
        return;
      }

      await paymentAnalytics.trackPurchaseCompletion({
        clientId: gaClientId,
        transactionId: sessionId,
        eventId: eventData.id,
        eventTitle: eventData.title,
        amount,
      });
    } catch (error) {
      handleServerError("GA4_TRACKING_FAILED", {
        action: "trackPurchaseCompletion",
        additionalData: {
          payment_id: paymentId,
          attendance_id: attendanceId,
          session_id: sessionId,
          error_message: error instanceof Error ? error.message : "Unknown error",
        },
      });
      this.logger.warn("Failed to send GA4 purchase tracking for checkout session", {
        payment_id: paymentId,
        attendance_id: attendanceId,
        session_id: sessionId,
        outcome: "failure",
      });
    }
  }
}
