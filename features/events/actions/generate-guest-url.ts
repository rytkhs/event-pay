import { z } from "zod";

import { verifyEventAccess } from "@core/auth/event-authorization";
import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
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
    await verifyEventAccess(eventId);

    const factory = SecureSupabaseClientFactory.create();
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
      return createServerActionError("NOT_FOUND", "参加レコードが見つかりません");
    }

    const guestToken: string | null = attendance.guest_token as unknown as string | null;
    if (!guestToken) {
      return createServerActionError("RESOURCE_CONFLICT", "ゲストトークンが未発行です");
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const guestUrl = `${baseUrl}/guest/${guestToken}`;

    const eventRel: unknown = (attendance as any).event;
    const ev = Array.isArray(eventRel) ? (eventRel[0] as any) : (eventRel as any);

    // イベントの状態をcanceled_atから判定
    const eventStatus = (ev as any).canceled_at ? "canceled" : "active";

    const eligibility = canCreateStripeSession(
      { id: attendance.id, status: attendance.status as any, payment: null },
      {
        id: ev.id as string,
        status: eventStatus as any,
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
