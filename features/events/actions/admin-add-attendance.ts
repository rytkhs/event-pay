import { z } from "zod";

import { verifyEventAccess } from "@core/auth/event-authorization";
import { type ActionResult, fail, ok, zodFail } from "@core/errors/adapters/server-actions";
import { logger } from "@core/logging/app-logger";
import { logAttendance } from "@core/logging/system-logger";
import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { getPaymentService } from "@core/services/payment-service";
import { PaymentError } from "@core/types/payment-errors";
import { deriveEventStatus } from "@core/utils/derive-event-status";
import { generateGuestToken } from "@core/utils/guest-token";
import { canCreateStripeSession } from "@core/validation/payment-eligibility";

// 入力検証
const AddAttendanceInputSchema = z
  .object({
    eventId: z.string().uuid(),
    nickname: z.string().min(1, "ニックネームは必須です").max(50),
    // MVPではメールを入力しない（将来の通知機能のためにschemaからは削除）
    status: z.enum(["attending", "maybe", "not_attending"]).default("attending"),
    bypassCapacity: z.boolean().optional().default(false),
    // 手動追加では現金決済のみ
    paymentMethod: z.enum(["cash"]).optional(),
  })
  .refine(
    (data) => {
      // attending状態の場合のみ決済方法の基本検証
      // 実際の有料判定はサーバー側で行うため、ここでは条件付き検証のみ
      if (data.status === "attending" && data.paymentMethod !== undefined) {
        return data.paymentMethod === "cash";
      }
      return true;
    },
    {
      message: "手動追加では現金決済のみ選択可能です",
      path: ["paymentMethod"],
    }
  );

export type AddAttendanceInput = z.infer<typeof AddAttendanceInputSchema>;

export interface AddAttendanceResult {
  attendanceId: string;
  guestToken: string;
  guestUrl: string;
  canOnlinePay: boolean;
  reason?: string;
  paymentId?: string; // 決済レコードが作成された場合のID
}

/**
 * 主催者が手動で参加者を追加する（締切制約なし、定員は上書き可能）
 * - RLSポリシーベースのセキュリティアクセス制御
 * - 専用RPC関数による排他ロック付き定員チェック
 * - レースコンディション対策済み
 * - 定員超過時、bypassCapacity=false なら確認要求エラーを返す
 * - 追加完了後、ゲストURLとオンライン決済可否を返す
 */
export async function adminAddAttendanceAction(
  input: unknown
): Promise<
  ActionResult<
    AddAttendanceResult | { confirmRequired: true; capacity?: number | null; current?: number }
  >
> {
  try {
    const { eventId, nickname, status, bypassCapacity, paymentMethod } =
      AddAttendanceInputSchema.parse(input);

    // 認証・主催者権限確認（イベント所有者）
    const { user } = await verifyEventAccess(eventId);

    // 認証済みクライアント（RLSポリシーベースのアクセス制御）
    const secureFactory = SecureSupabaseClientFactory.create();
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
            return ok({
              confirmRequired: true,
              capacity,
              current,
            });
          }
        }

        return fail("DATABASE_ERROR", {
          userMessage: rpcError?.message || "参加者の追加に失敗しました",
        });
      }

      attendanceId = rpcResult;
    } catch (error) {
      return fail("INTERNAL_ERROR", { userMessage: "参加者追加処理でエラーが発生しました" });
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
      return fail("NOT_FOUND", { userMessage: "イベント情報の取得に失敗しました" });
    }

    // 有料イベントでattending状態の場合、決済方法の検証と決済レコード作成
    let paymentId: string | undefined;
    if (status === "attending" && eventRow.fee > 0) {
      // 決済方法が指定されていない場合はエラー
      if (!paymentMethod) {
        return fail("VALIDATION_ERROR", {
          userMessage: "有料イベントの参加には決済方法の選択が必要です",
        });
      }

      // PaymentServiceを使用して現金決済レコードを作成
      try {
        const paymentService = getPaymentService();
        const result = await paymentService.createCashPayment({
          attendanceId,
          amount: eventRow.fee,
        });

        paymentId = result.paymentId;
      } catch (error) {
        // 参加者レコードを削除してロールバック（RLSポリシーで制御）
        await authenticatedClient.from("attendances").delete().eq("id", attendanceId);

        // PaymentErrorの場合は適切なエラーコードを返す
        if (error instanceof PaymentError) {
          return fail("DATABASE_ERROR", {
            userMessage: `決済レコードの作成に失敗しました: ${error.message}`,
          });
        }

        return fail("DATABASE_ERROR", {
          userMessage: "決済レコード作成処理でエラーが発生しました",
        });
      }
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
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const guestUrl = `${baseUrl}/guest/${guestToken}`;

    // 監査ログ（RLSポリシーベース実装）
    // 監査ログ
    logger.info("ADMIN_ADD_ATTENDANCE", {
      category: "attendance",
      action: "admin_add",
      actor_type: "user",
      event_id: eventId,
      attendance_id: attendanceId,
      actor_id: user.id,
      bypass_capacity: bypassCapacity,
      nickname,
      email: placeholderEmail.toLowerCase(),
      can_online_pay: eligibility.isEligible,
      payment_id: paymentId,
      method: "RLS_POLICY_BASED", // RLSポリシーベースのアクセス制御使用
      outcome: "success",
    });

    // DB監査ログ記録
    await logAttendance({
      action: "attendance.admin_add",
      message: `Admin added attendance: ${attendanceId}`,
      user_id: user.id,
      actor_type: "user",
      resource_id: attendanceId,
      outcome: "success",
      metadata: {
        event_id: eventId,
        nickname,
        email: placeholderEmail.toLowerCase(),
        status,
        bypass_capacity: bypassCapacity,
        payment_id: paymentId,
      },
    });

    return ok<AddAttendanceResult>({
      attendanceId,
      guestToken,
      guestUrl,
      canOnlinePay: eligibility.isEligible,
      reason: eligibility.reason,
      paymentId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return zodFail(error, { userMessage: error.errors?.[0]?.message || "入力が不正です" });
    }
    return fail("INTERNAL_ERROR", { userMessage: "参加者の追加処理でエラーが発生しました" });
  }
}
