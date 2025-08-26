"use server";

import { createClient } from "@/lib/supabase/server";
import { validateGuestToken } from "@/lib/utils/guest-token";
import { validateGuestTokenFormat } from "@/lib/security/crypto";
import {
  logInvalidTokenAccess,
  logParticipationSecurityEvent,
} from "@/lib/security/security-logger";
import { attendanceStatusSchema, paymentMethodSchema } from "@/lib/validations/participation";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/constants/payment-methods";
import type { Database } from "@/types/database";
import { headers } from "next/headers";
import { getClientIPFromHeaders } from "@/lib/utils/ip-detection";

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
    paymentMethod: Database["public"]["Enums"]["payment_method_enum"] | null;
    requiresAdditionalPayment: boolean;
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
  const headersList = headers();
  const userAgent = headersList.get("user-agent") || undefined;
  const ip = getClientIPFromHeaders(headersList);
  const securityContext = { userAgent, ip };

  // フォームデータの取得（スコープを関数全体に拡大）
  const guestToken = formData.get("guestToken") as string;
  const attendanceStatus = formData.get("attendanceStatus") as string;
  const paymentMethod = formData.get("paymentMethod") as string | null;

  try {

    // 基本検証
    if (!guestToken || typeof guestToken !== 'string') {
      return {
        success: false,
        error: "ゲストトークンが必要です",
      };
    }

    // トークン形式の基本チェック
    if (!validateGuestTokenFormat(guestToken)) {
      return {
        success: false,
        error: "無効なゲストトークンの形式です",
      };
    }

    // ゲストトークンの検証と参加データの取得
    const tokenValidation = await validateGuestToken(guestToken);
    if (!tokenValidation.isValid || !tokenValidation.attendance) {
      logInvalidTokenAccess(guestToken, "guest", securityContext);

      // 開発環境では詳細ログも出力
      if (process.env.NODE_ENV === "development") {
        const { logger } = await import("@/lib/logging/app-logger");
        logger.warn("無効なゲストトークンによるアクセス", {
          tag: "updateGuestAttendance",
          token_prefix: guestToken.substring(0, 4),
          error_message: tokenValidation.errorMessage,
        });
      }

      return {
        success: false,
        error: tokenValidation.errorMessage || "無効なゲストトークンです",
      };
    }

    // 変更可能かどうかの確認
    if (!tokenValidation.canModify) {
      const attendance = tokenValidation.attendance;
      const now = new Date();
      const eventDate = new Date(attendance.event.date);
      const registrationDeadline = attendance.event.registration_deadline
        ? new Date(attendance.event.registration_deadline)
        : null;

      // より詳細なエラーメッセージを提供
      let detailedError = "参加状況の変更期限を過ぎています";
      if (eventDate <= now) {
        detailedError = "イベント開始後は参加状況を変更できません";
      } else if (registrationDeadline && registrationDeadline <= now) {
        detailedError = "申込締切を過ぎているため、参加状況を変更できません";
      } else {
        detailedError = "現在は参加状況の変更を受け付けていません";
      }

      // 期限超過やイベント開始後の変更試行はセキュリティインシデントとして記録
      logParticipationSecurityEvent(
        "DEADLINE_BYPASS_ATTEMPT",
        "Attempt to modify attendance after deadline passed",
        {
          attendanceId: attendance.id,
          eventId: attendance.event.id,
        },
        securityContext
      );

      return {
        success: false,
        error: detailedError,
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
    let validatedPaymentMethod: Database["public"]["Enums"]["payment_method_enum"] | null = null;
    const isAttending = validatedStatus === "attending";
    const isPayableEvent = attendance.event.fee > 0;

    if (isAttending && isPayableEvent) {
      if (!paymentMethod || paymentMethod.trim() === '') {
        return {
          success: false,
          error: `参加を選択した場合は決済方法を選択してください（参加費: ${attendance.event.fee.toLocaleString("ja-JP")}円）`,
        };
      }

      const paymentValidation = paymentMethodSchema.safeParse(paymentMethod.trim());
      if (!paymentValidation.success) {
        // より詳細なバリデーションエラーメッセージ
        const labelList = PAYMENT_METHODS.filter((m) => m !== "free")
          .map((m) => PAYMENT_METHOD_LABELS[m])
          .join("、");
        return {
          success: false,
          error: `有効な決済方法を選択してください（選択可能: ${labelList}）`,
        };
      }
      validatedPaymentMethod = paymentValidation.data as Database["public"]["Enums"]["payment_method_enum"];
    }

    // 無料イベントまたは非参加の場合は決済方法を null にリセット
    if (!isAttending || !isPayableEvent) {
      validatedPaymentMethod = null;
    }

    const supabase = createClient();

    // データベース更新の実行（定員チェックはRPC関数内で実行される）
    // NOTE: `p_event_fee` は冗長に見えるが、以下の理由で呼び出し時に確定した金額を明示的に渡している。
    //   1. 画面表示時点でユーザーが確認した参加費で決済を確定させ、イベント主催者がその後に fee を変更しても影響を受けないようにするため。
    //   2. 将来の早割・クーポン等、ゲストごとに金額が変わる拡張を見越して、個別金額をRPCに渡す設計としている。
    //   3. events.fee をRPC内で都度参照すると、トランザクション外の変更が決済金額に反映され整合性が崩れるリスクがあるため。
    //     （例）fee を 0 → 500 に変更した直後にゲストが「不参加→参加」を送信した場合など。
    const { error } = await supabase.rpc("update_guest_attendance_with_payment", {
      p_attendance_id: attendance.id,
      p_status: validatedStatus,
      // Supabase RPC の型定義は undefined|enum だが、null を許容したいので
      // 明示的に null を渡すため型チェックを抑制
      // @ts-expect-error Supabase client typings do not allow null but DB param is nullable
      p_payment_method: validatedPaymentMethod,
      p_event_fee: attendance.event.fee,
    });

    if (error) {
      // RPC関数からのエラーメッセージを適切に処理
      let userFriendlyError = "参加状況の更新中にエラーが発生しました";

      if (error.message.includes("Event capacity") && error.message.includes("has been reached")) {
        userFriendlyError = "イベントの定員に達しているため参加できません";
        // 定員超過試行をセキュリティログに記録
        logParticipationSecurityEvent(
          "CAPACITY_BYPASS_ATTEMPT",
          "Attempt to bypass event capacity limit",
          {
            attendanceId: attendance.id,
            eventId: attendance.event.id,
          }
        );
      } else if (error.message.includes("registration_deadline") || error.message.includes("Event is closed for modification")) {
        userFriendlyError = "申込締切を過ぎているため参加状況を変更できません";
        // 期限超過試行をセキュリティログに記録
        logParticipationSecurityEvent(
          "DEADLINE_BYPASS_ATTEMPT",
          "Attempt to modify attendance after registration deadline",
          {
            attendanceId: attendance.id,
            eventId: attendance.event.id,
          }
        );
      } else if (error.message.includes("event not found")) {
        userFriendlyError = "イベントが見つかりませんでした";
      } else if (error.message.includes("attendance not found") || error.message.includes("Attendance record not found")) {
        userFriendlyError = "参加データが見つかりませんでした";
      } else if (error.message.includes("Rejecting status rollback")) {
        userFriendlyError = "参加状況を過去の状態に戻すことはできません";
      }

      // 開発環境ではより詳細なログを出力
      if (process.env.NODE_ENV === "development") {
        const { logger } = await import("@/lib/logging/app-logger");
        logger.error("RPC実行エラー", {
          tag: "updateGuestAttendance",
          error_message: error.message,
          error_code: error.code,
          attendance_id: attendance.id,
          event_id: attendance.event.id,
          new_status: validatedStatus,
          payment_method: validatedPaymentMethod,
        });
      }

      return {
        success: false,
        error: userFriendlyError,
      };
    }

    // 決済が必要かどうかの判定（境界条件を含む詳細チェック）
    const requiresAdditionalPayment = (() => {
      // 基本条件：参加、有料イベント、決済方法が指定されている
      if (validatedStatus !== "attending") return false;
      if (attendance.event.fee <= 0) return false;
      if (validatedPaymentMethod === null) return false;

      // ステータス変更の詳細チェック
      const currentStatus = attendance.status;
      const isStatusChanging = currentStatus !== validatedStatus;
      const currentPaymentMethod = attendance.payment?.method;
      const isPaymentMethodChanging = currentPaymentMethod !== validatedPaymentMethod;
      const currentPaymentStatus = attendance.payment?.status;

      // 新規参加登録（not_attending or maybe → attending）
      if (isStatusChanging && (currentStatus === "not_attending" || currentStatus === "maybe")) {
        return true;
      }

      // 既に参加で決済方法のみ変更
      if (currentStatus === "attending" && isPaymentMethodChanging) {
        return true;
      }

      // 再決済が必要なケース：参加中で同じ決済方法だが決済が失敗/未完了状態
      if (currentStatus === "attending" &&
        currentPaymentMethod === validatedPaymentMethod &&
        currentPaymentStatus &&
        ["failed", "pending"].includes(currentPaymentStatus)) {
        return true;
      }

      // 既に参加済みで同じ決済方法で決済完了済みの場合は不要
      return false;
    })();

    return {
      success: true,
      data: {
        attendanceId: attendance.id,
        status: validatedStatus,
        paymentMethod: validatedPaymentMethod,
        requiresAdditionalPayment,
      },
    };
  } catch (error) {
    // 予期しないエラーのログ記録
    if (process.env.NODE_ENV === "development") {
      const { logger } = await import("@/lib/logging/app-logger");
      logger.error("ゲスト参加状況更新で予期しないエラー", {
        tag: "updateGuestAttendance",
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
        guest_token_prefix: guestToken.substring(0, 4),
        attendance_status: attendanceStatus,
        payment_method: paymentMethod,
      });
    }

    return {
      success: false,
      error: "参加状況の更新中にエラーが発生しました。しばらく待ってからもう一度お試しください。",
    };
  }
}
