"use server";

import { z } from "zod";

import { verifyEventAccess } from "@core/auth/event-authorization";
import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import {
  createServerActionError,
  createServerActionSuccess,
  type ServerActionResult,
} from "@core/types/server-actions";
import { canCreateStripeSession } from "@core/validation/payment-eligibility";

const InputSchema = z.object({
  eventId: z.string().uuid(),
  attendanceId: z.string().uuid(),
});

export async function generateGuestUrlAction(input: unknown): Promise<
  ServerActionResult<{
    guestUrl: string;
    canOnlinePay: boolean;
    reason?: string;
  }>
> {
  try {
    const { eventId, attendanceId } = InputSchema.parse(input);

    // 主催者権限確認
    const { user } = await verifyEventAccess(eventId);

    const factory = SecureSupabaseClientFactory.getInstance();
    const admin = await factory.createAuditedAdminClient(
      AdminReason.EVENT_MANAGEMENT,
      "generate_guest_url",
      { eventId, actorId: user.id, attendanceId }
    );

    // attendance と event を取得（guest_token, 決済可否判定用）
    const { data: attendance, error: attErr } = await admin
      .from("attendances")
      .select(
        "id, status, guest_token, event:events(id, status, date, fee, payment_deadline, allow_payment_after_deadline, grace_period_days)"
      )
      .eq("id", attendanceId)
      .eq("event_id", eventId)
      .single();

    if (attErr || !attendance) {
      return createServerActionError("NOT_FOUND", "参加レコードが見つかりません");
    }

    const guestToken: string | null = attendance.guest_token as unknown as string | null;
    if (!guestToken) {
      return createServerActionError("RESOURCE_CONFLICT", "ゲストトークンが未発行です");
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "http://localhost:3000";
    const guestUrl = `${baseUrl}/guest/${guestToken}`;

    const eventRel: unknown = (attendance as any).event;
    const ev = Array.isArray(eventRel) ? (eventRel[0] as any) : (eventRel as any);

    const eligibility = canCreateStripeSession(
      { id: attendance.id, status: attendance.status as any, payment: null },
      {
        id: ev.id as string,
        status: ev.status as any,
        fee: ev.fee as number,
        date: ev.date as string,
        payment_deadline: (ev as any).payment_deadline ?? null,
        allow_payment_after_deadline: (ev as any).allow_payment_after_deadline ?? false,
        grace_period_days: (ev as any).grace_period_days ?? 0,
      }
    );

    return createServerActionSuccess({
      guestUrl,
      canOnlinePay: eligibility.isEligible,
      reason: eligibility.reason,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return createServerActionError(
        "VALIDATION_ERROR",
        error.errors?.[0]?.message || "入力が不正です",
        {
          details: { zodErrors: error.errors },
        }
      );
    }
    return createServerActionError("INTERNAL_ERROR", "ゲストURLの生成でエラーが発生しました");
  }
}
