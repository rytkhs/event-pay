import { getSettlementReportPort } from "@core/ports/settlements";
import type { AppSupabaseClient } from "@core/types/supabase";
import { handleServerError } from "@core/utils/error-handler.server";

import type { WebhookContextLogger } from "../context/webhook-handler-context";

interface SettlementRegenerationServiceParams {
  supabase: AppSupabaseClient;
  logger: WebhookContextLogger;
}

interface SettlementRegenerationMeta {
  action: string;
  eventId?: string;
  paymentId?: string;
}

interface SettlementRegenerationPayment {
  attendance_id?: string | null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export class SettlementRegenerationService {
  private readonly supabase: AppSupabaseClient;
  private readonly logger: WebhookContextLogger;

  constructor(params: SettlementRegenerationServiceParams) {
    this.supabase = params.supabase;
    this.logger = params.logger;
  }

  async regenerateSettlementSnapshotFromPayment(
    payment: SettlementRegenerationPayment | null,
    meta: SettlementRegenerationMeta
  ): Promise<void> {
    try {
      const attendanceId = payment?.attendance_id ?? null;
      if (!isNonEmptyString(attendanceId)) {
        handleServerError("SETTLEMENT_REGENERATE_FAILED", {
          action: meta.action,
          additionalData: {
            eventId: meta.eventId,
            paymentId: meta.paymentId,
            paymentHasAttendanceId: false,
          },
        });
        return;
      }

      const { data: attendance, error: attendanceError } = await this.supabase
        .from("attendances")
        .select("event_id")
        .eq("id", attendanceId)
        .maybeSingle();
      if (attendanceError || !attendance) {
        handleServerError("SETTLEMENT_REGENERATE_FAILED", {
          action: meta.action,
          additionalData: {
            eventId: meta.eventId,
            paymentId: meta.paymentId,
            attendanceId,
            error: attendanceError?.message ?? "attendance_not_found",
          },
        });
        return;
      }

      const eventId = (attendance as { event_id: string }).event_id;
      const { data: eventRow, error: eventError } = await this.supabase
        .from("events")
        .select("created_by")
        .eq("id", eventId)
        .maybeSingle();
      if (eventError || !eventRow) {
        handleServerError("SETTLEMENT_REGENERATE_FAILED", {
          action: meta.action,
          additionalData: {
            eventId,
            paymentId: meta.paymentId,
            error: eventError?.message ?? "event_not_found",
          },
        });
        return;
      }

      const createdBy = (eventRow as { created_by: string }).created_by;
      const settlementPort = getSettlementReportPort();
      const result = await settlementPort.regenerateAfterRefundOrDispute(eventId, createdBy);
      if (!result.success) {
        handleServerError("SETTLEMENT_REGENERATE_FAILED", {
          action: meta.action,
          additionalData: {
            eventId,
            paymentId: meta.paymentId,
            createdBy,
            error: result.error.message,
          },
        });
        return;
      }

      this.logger.info("Settlement snapshot regenerated successfully", {
        event_id: eventId,
        created_by: createdBy,
        report_id: result.data?.reportId,
        source_action: meta.action,
        outcome: "success",
      });
    } catch (error) {
      handleServerError("SETTLEMENT_REGENERATE_FAILED", {
        action: meta.action,
        additionalData: {
          eventId: meta.eventId,
          paymentId: meta.paymentId,
          error: error instanceof Error ? error.message : "unknown",
        },
      });
    }
  }
}
