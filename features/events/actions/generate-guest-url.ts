import { ZodError } from "zod";

import { verifyEventAccess } from "@core/auth/event-authorization";
import { type ActionResult, fail, ok, zodFail } from "@core/errors/adapters/server-actions";
import { getSecureClientFactory } from "@core/security/secure-client-factory.impl";
import type { AttendanceStatus } from "@core/types/statuses";
import { deriveEventStatus } from "@core/utils/derive-event-status";
import {
  canCreateStripeSession,
  type PaymentEligibilityAttendance,
  type PaymentEligibilityEvent,
} from "@core/validation/payment-eligibility";

import { generateGuestUrlInputSchema } from "../validation";

type EventRelationRow = {
  id: string;
  date: string;
  fee: number;
  payment_deadline: string | null;
  allow_payment_after_deadline: boolean | null;
  grace_period_days: number | null;
  canceled_at: string | null;
};

type AttendanceWithEventRow = {
  id: string;
  status: AttendanceStatus;
  guest_token: string | null;
  event: EventRelationRow | EventRelationRow[] | null;
};

export async function generateGuestUrlAction(input: unknown): Promise<
  ActionResult<{
    guestUrl: string;
    canOnlinePay: boolean;
    reason?: string;
  }>
> {
  try {
    const { eventId, attendanceId } = generateGuestUrlInputSchema.parse(input);

    // 主催者権限確認
    await verifyEventAccess(eventId);

    const factory = getSecureClientFactory();
    const authenticatedClient = factory.createAuthenticatedClient();

    // attendance と event を取得（guest_token, 決済可否判定用）
    const { data: attendance, error: attErr } = await authenticatedClient
      .from("attendances")
      .select(
        "id, status, guest_token, event:events(id, date, fee, payment_deadline, allow_payment_after_deadline, grace_period_days, canceled_at)"
      )
      .eq("id", attendanceId)
      .eq("event_id", eventId)
      .single();

    if (attErr || !attendance) {
      return fail("NOT_FOUND", { userMessage: "参加レコードが見つかりません" });
    }

    const attendanceRow = attendance as AttendanceWithEventRow;
    const guestToken = attendanceRow.guest_token;
    if (!guestToken) {
      return fail("RESOURCE_CONFLICT", { userMessage: "ゲストトークンが未発行です" });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const guestUrl = `${baseUrl}/guest/${guestToken}`;

    const eventRel = attendanceRow.event;
    const eventRow = Array.isArray(eventRel) ? eventRel[0] : eventRel;
    if (!eventRow) {
      return fail("NOT_FOUND", { userMessage: "イベント情報が見つかりません" });
    }

    const attendanceForEligibility: PaymentEligibilityAttendance = {
      id: attendanceRow.id,
      status: attendanceRow.status,
      payment: null,
    };
    const eventForEligibility: PaymentEligibilityEvent = {
      id: eventRow.id,
      status: deriveEventStatus(eventRow.date, eventRow.canceled_at),
      fee: eventRow.fee,
      date: eventRow.date,
      payment_deadline: eventRow.payment_deadline,
      allow_payment_after_deadline: eventRow.allow_payment_after_deadline ?? false,
      grace_period_days: eventRow.grace_period_days ?? 0,
    };

    const eligibility = canCreateStripeSession(attendanceForEligibility, eventForEligibility);

    return ok({
      guestUrl,
      canOnlinePay: eligibility.isEligible,
      reason: eligibility.reason,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return zodFail(error, { userMessage: error.errors?.[0]?.message || "入力が不正です" });
    }
    return fail("INTERNAL_ERROR", { userMessage: "ゲストURLの生成でエラーが発生しました" });
  }
}
