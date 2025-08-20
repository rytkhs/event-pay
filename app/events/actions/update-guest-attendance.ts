"use server";

import { createClient } from "@/lib/supabase/server";
import { validateGuestToken } from "@/lib/utils/guest-token";
import { sanitizeForEventPay as _sanitizeForEventPay } from "@/lib/utils/sanitize";
import { attendanceStatusSchema, paymentMethodSchema } from "@/lib/validations/participation";
import type { Database } from "@/types/database";

// 更新データの型定義
export interface UpdateGuestAttendanceData {
  guestToken: string;
  attendanceStatus: Database["public"]["Enums"]["attendance_status_enum"];
  paymentMethod?: Database["public"]["Enums"]["payment_method_enum"];
}

// 更新結果の型定義
export interface UpdateGuestAttendanceResult {
  success: boolean;
  data?: {
    attendanceId: string;
    status: Database["public"]["Enums"]["attendance_status_enum"];
    paymentMethod?: Database["public"]["Enums"]["payment_method_enum"];
    requiresPayment: boolean;
  };
  error?: string;
}

/**
 * ゲスト参加状況を更新するサーバーアクション
 * @param formData フォームデータ
 * @returns 更新結果
 */
export async function updateGuestAttendanceAction(
  formData: FormData
): Promise<UpdateGuestAttendanceResult> {
  try {
    // フォームデータの取得
    const guestToken = formData.get("guestToken") as string;
    const attendanceStatus = formData.get("attendanceStatus") as string;
    const paymentMethod = formData.get("paymentMethod") as string | null;

    // 基本検証
    if (!guestToken) {
      return {
        success: false,
        error: "ゲストトークンが必要です",
      };
    }

    // ゲストトークンの検証と参加データの取得
    const tokenValidation = await validateGuestToken(guestToken);
    if (!tokenValidation.isValid || !tokenValidation.attendance) {
      return {
        success: false,
        error: tokenValidation.errorMessage || "無効なゲストトークンです",
      };
    }

    // 変更可能かどうかの確認
    if (!tokenValidation.canModify) {
      return {
        success: false,
        error: "参加状況の変更期限を過ぎています",
      };
    }

    const attendance = tokenValidation.attendance;

    // 参加ステータスの検証
    const statusValidation = attendanceStatusSchema.safeParse(attendanceStatus);
    if (!statusValidation.success) {
      return {
        success: false,
        error: "有効な参加ステータスを選択してください",
      };
    }

    const validatedStatus = statusValidation.data;

    // 決済方法の検証（参加の場合かつ有料イベントの場合のみ）
    let validatedPaymentMethod: Database["public"]["Enums"]["payment_method_enum"] | undefined;
    if (validatedStatus === "attending" && attendance.event.fee > 0) {
      if (!paymentMethod) {
        return {
          success: false,
          error: "参加を選択した場合は決済方法を選択してください",
        };
      }

      const paymentValidation = paymentMethodSchema.safeParse(paymentMethod);
      if (!paymentValidation.success) {
        return {
          success: false,
          error: "有効な決済方法を選択してください",
        };
      }
      validatedPaymentMethod = paymentValidation.data;
    }

    const supabase = createClient();

    // データベース更新の実行（定員チェックはRPC関数内で実行される）
    const { error } = await supabase.rpc("update_guest_attendance_with_payment", {
      p_attendance_id: attendance.id,
      p_status: validatedStatus,
      p_payment_method: validatedPaymentMethod as any,
      p_event_fee: attendance.event.fee,
    });

    if (error) {
      // RPC関数からのエラーメッセージを適切に処理
      if (error.message.includes("Event capacity") && error.message.includes("has been reached")) {
        return {
          success: false,
          error: "イベントの定員に達しているため参加できません",
        };
      }
      throw error;
    }

    // 決済が必要かどうかの判定
    const requiresPayment =
      validatedStatus === "attending" &&
      attendance.event.fee > 0 &&
      validatedPaymentMethod !== undefined;

    return {
      success: true,
      data: {
        attendanceId: attendance.id,
        status: validatedStatus,
        paymentMethod: validatedPaymentMethod,
        requiresPayment,
      },
    };
  } catch (_error) {
    return {
      success: false,
      error: "参加状況の更新中にエラーが発生しました",
    };
  }
}
