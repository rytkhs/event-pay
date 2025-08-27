"use server";

import { SecureSupabaseClientFactory, AdminReason } from "@/lib/security";
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
import {
  createServerActionError,
  createServerActionSuccess,
  type ServerActionResult
} from "@/lib/types/server-actions";

// 更新データの型定義
export interface UpdateGuestAttendanceInput {
  guestToken: string;
  attendanceStatus: Database["public"]["Enums"]["attendance_status_enum"];
  paymentMethod?: Database["public"]["Enums"]["payment_method_enum"];
}

// 更新結果のデータ型定義
export interface UpdateGuestAttendanceData {
  attendanceId: string;
  status: Database["public"]["Enums"]["attendance_status_enum"];
  paymentMethod: Database["public"]["Enums"]["payment_method_enum"] | null;
  requiresAdditionalPayment: boolean;
}

/**
 * ゲスト参加状況を更新するサーバーアクション
 * @param formData フォームデータ
 * @returns 更新結果
 */
export async function updateGuestAttendanceAction(
  formData: FormData
): Promise<ServerActionResult<UpdateGuestAttendanceData>> {
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
      return createServerActionError("MISSING_PARAMETER", "ゲストトークンが必要です");
    }

    // トークン形式の基本チェック
    if (!validateGuestTokenFormat(guestToken)) {
      return createServerActionError("VALIDATION_ERROR", "無効なゲストトークンの形式です");
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

      return createServerActionError(
        "UNAUTHORIZED",
        tokenValidation.errorMessage || "無効なゲストトークンです"
      );
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

      return createServerActionError("FORBIDDEN", detailedError);
    }

    const attendance = tokenValidation.attendance;

    // 参加ステータスの検証
    const statusValidation = attendanceStatusSchema.safeParse(attendanceStatus);
    if (!statusValidation.success) {
      return createServerActionError("VALIDATION_ERROR", "有効な参加ステータスを選択してください");
    }

    const validatedStatus = statusValidation.data;

    // 決済方法の検証（参加の場合かつ有料イベントの場合のみ）
    let validatedPaymentMethod: Database["public"]["Enums"]["payment_method_enum"] | null = null;
    const isAttending = validatedStatus === "attending";
    const isPayableEvent = attendance.event.fee > 0;

    if (isAttending && isPayableEvent) {
      if (!paymentMethod || paymentMethod.trim() === '') {
        return createServerActionError(
          "VALIDATION_ERROR",
          `参加を選択した場合は決済方法を選択してください（参加費: ${attendance.event.fee.toLocaleString("ja-JP")}円）`
        );
      }

      const paymentValidation = paymentMethodSchema.safeParse(paymentMethod.trim());
      if (!paymentValidation.success) {
        // より詳細なバリデーションエラーメッセージ
        const labelList = PAYMENT_METHODS.filter((m) => m !== "free")
          .map((m) => PAYMENT_METHOD_LABELS[m])
          .join("、");
        return createServerActionError(
          "VALIDATION_ERROR",
          `有効な決済方法を選択してください（選択可能: ${labelList}）`
        );
      }
      validatedPaymentMethod = paymentValidation.data as Database["public"]["Enums"]["payment_method_enum"];
    }

    // 無料イベントまたは非参加の場合は決済方法を null にリセット
    if (!isAttending || !isPayableEvent) {
      validatedPaymentMethod = null;
    }

    // finalized 決済状態の定義（支払いが確定しており不可逆な状態）
    const finalizedPaymentStatuses: Array<Database["public"]["Enums"]["payment_status_enum"]> = [
      "paid",
      "received",
      "completed",
      "waived",
    ];

    // finalized 後の決済方法変更をサーバ側でも明示的に拒否
    // 条件: 参加ステータスは変えず（既に attending）、決済方法のみ変更、かつ現在の支払いが finalized
    if (
      attendance.status === "attending" &&
      validatedStatus === "attending" &&
      attendance.event.fee > 0 &&
      validatedPaymentMethod !== null
    ) {
      const currentPaymentMethod = attendance.payment?.method ?? null;
      const currentPaymentStatus = attendance.payment?.status ?? null;
      const isPaymentMethodChanging = currentPaymentMethod !== validatedPaymentMethod;
      if (
        isPaymentMethodChanging &&
        currentPaymentStatus &&
        finalizedPaymentStatuses.includes(currentPaymentStatus)
      ) {
        // 監査ログ
        logParticipationSecurityEvent(
          "PAYMENT_METHOD_CHANGE_AFTER_FINALIZED_ATTEMPT",
          "Attempt to change payment method after payment finalized",
          {
            attendanceId: attendance.id,
            eventId: attendance.event.id,
          },
          securityContext
        );

        return createServerActionError(
          "RESOURCE_CONFLICT",
          "支払が確定しているため、決済方法を変更できません"
        );
      }
    }

    // 監査付きの service_role クライアントを取得
    const secureFactory = SecureSupabaseClientFactory.getInstance();
    const adminClient = await secureFactory.createAuditedAdminClient(
      AdminReason.PAYMENT_PROCESSING,
      "update_guest_attendance_with_payment",
      { ipAddress: ip, userAgent, guestToken }
    );

    // データベース更新の実行（定員チェックはRPC関数内で実行される）
    // NOTE: `p_event_fee` は冗長に見えるが、以下の理由で呼び出し時に確定した金額を明示的に渡している。
    //   1. 画面表示時点でユーザーが確認した参加費で決済を確定させ、イベント主催者がその後に fee を変更しても影響を受けないようにするため。
    //   2. 将来の早割・クーポン等、ゲストごとに金額が変わる拡張を見越して、個別金額をRPCに渡す設計としている。
    //   3. events.fee をRPC内で都度参照すると、トランザクション外の変更が決済金額に反映され整合性が崩れるリスクがあるため。
    //     （例）fee を 0 → 500 に変更した直後にゲストが「不参加→参加」を送信した場合など。
    const { error } = await adminClient.rpc("update_guest_attendance_with_payment", {
      p_attendance_id: attendance.id,
      p_status: validatedStatus,
      p_payment_method: validatedPaymentMethod,
      p_event_fee: attendance.event.fee,
    });

    if (error) {
      // RPC関数からのエラーメッセージを安定したコードベースで処理
      // 将来的にはRPC側で機械可読なコードを返すことを推奨

      let errorCode: string;
      let userFriendlyError: string;

      // 固定キーワードベースでの分類（暫定対応）
      if (error.message.includes("EVP_CAPACITY_REACHED") ||
        (error.message.includes("Event capacity") && error.message.includes("has been reached"))) {
        errorCode = "ATTENDANCE_CAPACITY_REACHED";
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

      } else if (error.message.includes("EVP_PAYMENT_FINALIZED_IMMUTABLE")) {
        errorCode = "RESOURCE_CONFLICT";
        userFriendlyError = "支払が確定しているため、決済情報を変更できません";

      } else if (error.message.includes("EVP_DEADLINE_PASSED") ||
        error.message.includes("registration_deadline") ||
        error.message.includes("Event is closed for modification")) {
        errorCode = "ATTENDANCE_DEADLINE_PASSED";
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

      } else if (error.message.includes("EVP_EVENT_NOT_FOUND") ||
        error.message.includes("event not found")) {
        errorCode = "NOT_FOUND";
        userFriendlyError = "イベントが見つかりませんでした";

      } else if (error.message.includes("EVP_ATTENDANCE_NOT_FOUND") ||
        error.message.includes("attendance not found") ||
        error.message.includes("Attendance record not found")) {
        errorCode = "ATTENDANCE_NOT_FOUND";
        userFriendlyError = "参加データが見つかりませんでした";

      } else if (error.message.includes("EVP_STATUS_ROLLBACK_REJECTED") ||
        error.message.includes("Rejecting status rollback")) {
        errorCode = "ATTENDANCE_STATUS_ROLLBACK_REJECTED";
        userFriendlyError = "参加状況を過去の状態に戻すことはできません";

      } else {
        errorCode = "DATABASE_ERROR";
        userFriendlyError = "参加状況の更新中にエラーが発生しました";
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

      return createServerActionError(errorCode as "ATTENDANCE_CAPACITY_REACHED" | "ATTENDANCE_DEADLINE_PASSED" | "NOT_FOUND" | "ATTENDANCE_NOT_FOUND" | "ATTENDANCE_STATUS_ROLLBACK_REJECTED" | "DATABASE_ERROR", userFriendlyError);
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
        // 既に確定済みの支払いがある場合は追加決済不要
        if (currentPaymentStatus && finalizedPaymentStatuses.includes(currentPaymentStatus)) {
          return false;
        }
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

    return createServerActionSuccess({
      attendanceId: attendance.id,
      status: validatedStatus,
      paymentMethod: validatedPaymentMethod,
      requiresAdditionalPayment,
    });
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

    return createServerActionError(
      "INTERNAL_ERROR",
      "参加状況の更新中にエラーが発生しました。しばらく待ってからもう一度お試しください。"
    );
  }
}
