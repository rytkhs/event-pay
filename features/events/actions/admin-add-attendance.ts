"use server";

import { z } from "zod";

import { verifyEventAccess } from "@core/auth/event-authorization";
import { logger } from "@core/logging/app-logger";
import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
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
 * - 専用RPC関数による排他ロック付き定員チェック
 * - レースコンディション対策済み
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

    // 認証済みクライアント（RPC関数呼び出し用）
    const secureFactory = SecureSupabaseClientFactory.getInstance();
    const authenticatedClient = secureFactory.createAuthenticatedClient();

    // ゲストトークン生成
    const guestToken = generateGuestToken();

    // プレースホルダーメール生成（MVP: emailは未収集）
    const placeholderEmail = `noemail+${guestToken.substring(4, 12)}.${eventId.substring(0, 8)}@guest.eventpay.local`;

    // 専用RPC関数で参加者を追加（排他ロック付き定員チェック）
    let attendanceId: string;
    try {
      const { data: rpcResult, error: rpcError } = await authenticatedClient
        .rpc("admin_add_attendance_with_capacity_check", {
          p_event_id: eventId,
          p_nickname: nickname,
          p_email: placeholderEmail,
          p_status: status,
          p_guest_token: guestToken,
          p_bypass_capacity: bypassCapacity,
        })
        .returns<string>()
        .single();

      if (rpcError || !rpcResult) {
        // 定員超過の場合の特別処理
        if (
          rpcError?.message?.includes("Event capacity") &&
          rpcError.message.includes("has been reached")
        ) {
          // エラーメッセージから現在の参加者数と定員を抽出
          const capacityMatch = rpcError.message.match(
            /Event capacity \((\d+)\) has been reached\. Current attendees: (\d+)/
          );
          if (capacityMatch) {
            const capacity = parseInt(capacityMatch[1], 10);
            const current = parseInt(capacityMatch[2], 10);
            return createServerActionSuccess({
              confirmRequired: true,
              capacity,
              current,
            });
          }
        }

        return createServerActionError(
          "DATABASE_ERROR",
          rpcError?.message || "参加者の追加に失敗しました"
        );
      }

      attendanceId = rpcResult;
    } catch (error) {
      return createServerActionError("INTERNAL_ERROR", "参加者追加処理でエラーが発生しました");
    }

    // イベント情報取得（決済可否判定用）
    const { data: eventRow, error: eventErr } = await authenticatedClient
      .from("events")
      .select(
        `id, created_by, date, fee, payment_deadline, allow_payment_after_deadline, grace_period_days, canceled_at`
      )
      .eq("id", eventId)
      .single();

    if (eventErr || !eventRow) {
      return createServerActionError("NOT_FOUND", "イベント情報の取得に失敗しました");
    }

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

    // 監査ログ（RPC関数ベース実装）
    logger.info("ADMIN_ADD_ATTENDANCE", {
      eventId,
      attendanceId,
      actorId: user.id,
      bypassCapacity,
      nickname,
      email: placeholderEmail.toLowerCase(),
      canOnlinePay: eligibility.isEligible,
      method: "RPC_WITH_EXCLUSIVE_LOCK", // 排他ロック付きRPC関数使用
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
