"use server";

import { z } from "zod";

import { verifyEventAccess } from "@core/auth/event-authorization";
import { logger } from "@core/logging/app-logger";
import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import {
  createServerActionError,
  createServerActionSuccess,
  type ServerActionResult,
} from "@core/types/server-actions";
import { deriveEventStatus } from "@core/utils/derive-event-status";
import { generateGuestToken } from "@core/utils/guest-token";
import { canCreateStripeSession } from "@core/validation/payment-eligibility";

// 入力検証
const AddAttendanceInputSchema = z.object({
  eventId: z.string().uuid(),
  nickname: z.string().min(1, "ニックネームは必須です").max(50),
  // MVPではメールを入力しない（将来の通知機能のためにschemaからは削除）
  status: z.enum(["attending", "maybe", "not_attending"]).default("attending"),
  bypassCapacity: z.boolean().optional().default(false),
});

export type AddAttendanceInput = z.infer<typeof AddAttendanceInputSchema>;

export interface AddAttendanceResult {
  attendanceId: string;
  guestToken: string;
  guestUrl: string;
  canOnlinePay: boolean;
  reason?: string;
}

/**
 * 主催者が手動で参加者を追加する（締切制約なし、定員は上書き可能）
 * - 既存のRPCの容量チェックを回避するため、Service Roleで直接INSERT
 * - 定員超過時、bypassCapacity=false なら確認要求エラーを返す
 * - 追加完了後、ゲストURLとオンライン決済可否を返す
 */
export async function adminAddAttendanceAction(
  input: unknown
): Promise<
  ServerActionResult<
    AddAttendanceResult | { confirmRequired: true; capacity?: number | null; current?: number }
  >
> {
  try {
    const { eventId, nickname, status, bypassCapacity } = AddAttendanceInputSchema.parse(input);

    // 認証・主催者権限確認（イベント所有者）
    const { user } = await verifyEventAccess(eventId);

    // 認証済みクライアント（RLS）と管理クライアント（RLSバイパス）
    const secureFactory = SecureSupabaseClientFactory.getInstance();
    const adminClient = await secureFactory.createAuditedAdminClient(
      AdminReason.EVENT_MANAGEMENT,
      "admin_add_attendance",
      { eventId, actorId: user.id }
    );

    // イベント情報取得（決済可否判定・定員チェック用）
    const { data: eventRow, error: eventErr } = await adminClient
      .from("events")
      .select(
        `id, created_by, date, fee, capacity, registration_deadline, payment_deadline, allow_payment_after_deadline, grace_period_days, canceled_at`
      )
      .eq("id", eventId)
      .single();

    if (eventErr || !eventRow) {
      return createServerActionError("NOT_FOUND", "イベントが見つかりません");
    }

    // 重複メールチェック（同一イベント内）
    // MVP: email は入力しないため重複チェックはスキップ

    // 定員チェック（attending 追加時のみ）
    if (status === "attending" && eventRow.capacity !== null) {
      const { count: currentCount, error: cntErr } = await adminClient
        .from("attendances")
        .select("id", { count: "exact", head: true })
        .eq("event_id", eventId)
        .eq("status", "attending");
      if (cntErr) {
        return createServerActionError("DATABASE_ERROR", cntErr.message);
      }
      const isFull =
        typeof currentCount === "number" && currentCount >= (eventRow.capacity as number);
      if (isFull && !bypassCapacity) {
        // 確認要求
        return createServerActionSuccess({
          confirmRequired: true,
          capacity: eventRow.capacity,
          current: currentCount,
        });
      }
    }

    // ゲストトークン生成
    const guestToken = generateGuestToken();

    // 参加者レコード挿入（MVP: emailは未収集のためプレースホルダを保存）
    const placeholderEmail = `noemail+${guestToken.substring(4, 12)}.${eventId.substring(0, 8)}@guest.eventpay.local`;
    const { data: inserted, error: insErr } = await adminClient
      .from("attendances")
      .insert({
        event_id: eventId,
        nickname,
        email: placeholderEmail,
        status,
        guest_token: guestToken,
      })
      .select("id")
      .single();

    if (insErr || !inserted) {
      return createServerActionError(
        "DATABASE_ERROR",
        insErr?.message || "参加者の追加に失敗しました"
      );
    }

    const attendanceId = inserted.id as string;

    // 決済可否（Stripe）を判定
    const eventForEligibility = {
      id: eventRow.id,
      status: deriveEventStatus(eventRow.date, (eventRow as any).canceled_at ?? null),
      fee: eventRow.fee,
      date: eventRow.date,
      payment_deadline: eventRow.payment_deadline,
      allow_payment_after_deadline: eventRow.allow_payment_after_deadline ?? false,
      grace_period_days: eventRow.grace_period_days ?? 0,
    };
    const attendanceForEligibility = {
      id: attendanceId,
      status: status as any,
      payment: null,
    };
    const eligibility = canCreateStripeSession(attendanceForEligibility, eventForEligibility);

    // ゲストURL（/guest/gst_xxx）
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "http://localhost:3000";
    const guestUrl = `${baseUrl}/guest/${guestToken}`;

    // 監査ログ
    logger.info("ADMIN_ADD_ATTENDANCE", {
      eventId,
      attendanceId,
      actorId: user.id,
      bypassCapacity,
      nickname,
      email: placeholderEmail.toLowerCase(),
      canOnlinePay: eligibility.isEligible,
    });

    return createServerActionSuccess<AddAttendanceResult>({
      attendanceId,
      guestToken,
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
    return createServerActionError("INTERNAL_ERROR", "参加者の追加処理でエラーが発生しました");
  }
}
