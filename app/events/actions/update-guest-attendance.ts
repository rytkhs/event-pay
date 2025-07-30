"use server";

import { createClient } from "@/lib/supabase/server";
import { validateGuestToken } from "@/lib/utils/guest-token";
import { sanitizeForEventPay } from "@/lib/utils/sanitize";
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

    // 定員チェック（参加に変更する場合）
    if (validatedStatus === "attending" && attendance.status !== "attending") {
      const capacityCheck = await checkEventCapacity(attendance.event.id);
      if (!capacityCheck.canRegister) {
        return {
          success: false,
          error: "イベントの定員に達しているため参加できません",
        };
      }
    }

    const supabase = createClient();

    // データベース更新の実行
    await supabase.rpc("update_guest_attendance_with_payment", {
      p_attendance_id: attendance.id,
      p_status: validatedStatus,
      p_payment_method: validatedPaymentMethod || null,
      p_event_fee: attendance.event.fee,
    });

    // 決済が必要かどうかの判定
    const requiresPayment = validatedStatus === "attending" &&
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
  } catch (error) {
    console.error("ゲスト参加状況更新エラー:", error);
    return {
      success: false,
      error: "参加状況の更新中にエラーが発生しました",
    };
  }
}

/**
 * イベントの定員状況をチェックする
 * @param eventId イベントID
 * @returns 定員チェック結果
 */
async function checkEventCapacity(eventId: string): Promise<{
  canRegister: boolean;
  currentCount: number;
  capacity: number | null;
}> {
  try {
    const supabase = createClient();

    // イベント情報と現在の参加者数を取得
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("capacity")
      .eq("id", eventId)
      .single();

    if (eventError || !event) {
      throw new Error("イベント情報の取得に失敗しました");
    }

    // 定員が設定されていない場合は常に参加可能
    if (!event.capacity) {
      return {
        canRegister: true,
        currentCount: 0,
        capacity: null,
      };
    }

    // 現在の参加者数を取得
    const { count: currentCount, error: countError } = await supabase
      .from("attendances")
      .select("*", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("status", "attending");

    if (countError) {
      throw new Error("参加者数の取得に失敗しました");
    }

    const attendingCount = currentCount || 0;

    return {
      canRegister: attendingCount < event.capacity,
      currentCount: attendingCount,
      capacity: event.capacity,
    };
  } catch (error) {
    console.error("定員チェックエラー:", error);
    // エラーの場合は安全側に倒して参加不可とする
    return {
      canRegister: false,
      currentCount: 0,
      capacity: null,
    };
  }
}