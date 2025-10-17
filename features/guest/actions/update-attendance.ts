"use server";

import { headers } from "next/headers";

import { PAYMENT_METHODS } from "@core/constants/payment-methods";
import { validateGuestTokenFormat } from "@core/security/crypto";
import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import {
  logInvalidTokenAccess,
  logParticipationSecurityEvent,
} from "@core/security/security-logger";
import {
  createServerActionError,
  createServerActionSuccess,
  type ServerActionResult,
} from "@core/types/server-actions";
import { validateGuestToken } from "@core/utils/guest-token";
import { getClientIPFromHeaders } from "@core/utils/ip-detection";
import { attendanceStatusSchema, paymentMethodSchema } from "@core/validation/participation";

import type { Database } from "@/types/database";

import type { UpdateGuestAttendanceData } from "../types";

// 型定義は features/guest/types.ts に統一

/**
 * ゲスト参加状況を更新するサーバーアクション
 * @param formData フォームデータ
 * @returns 更新結果
 */
export async function updateGuestAttendanceAction(
  formData: FormData
): Promise<ServerActionResult<UpdateGuestAttendanceData>> {
  // テスト環境ではheaders()が利用できないため、安全に取得
  let securityContext: { userAgent?: string; ip?: string } = {};
  try {
    const headersList = headers();
    const userAgent = headersList.get("user-agent") || undefined;
    const ip = getClientIPFromHeaders(headersList);
    securityContext = { userAgent, ip };
  } catch (error) {
    // テスト環境など、headers()が利用できない場合は空のコンテキストを使用
    if (process.env.NODE_ENV === "test") {
      securityContext = { userAgent: "test-agent", ip: "127.0.0.1" };
    } else {
      securityContext = {};
    }
  }

  // フォームデータの取得（スコープを関数全体に拡大）
  const guestToken = formData.get("guestToken") as string;
  const attendanceStatus = formData.get("attendanceStatus") as string;
  const paymentMethod = formData.get("paymentMethod") as string | null;

  try {
    // 基本検証
    if (!guestToken || typeof guestToken !== "string") {
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
        const { logger } = await import("@core/logging/app-logger");
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
      return createServerActionError(
        "ATTENDANCE_DEADLINE_PASSED",
        "参加登録の期限が過ぎているため、変更できません"
      );
    }

    const attendance = tokenValidation.attendance;

    // 参加状況の検証
    const validatedStatus = attendanceStatusSchema.safeParse(attendanceStatus);
    if (!validatedStatus.success) {
      return createServerActionError("VALIDATION_ERROR", "無効な参加状況です");
    }

    // 決済方法の検証（有料イベントで参加する場合のみ）
    let validatedPaymentMethod: Database["public"]["Enums"]["payment_method_enum"] | null = null;

    if (validatedStatus.data === "attending" && attendance.event.fee > 0) {
      if (!paymentMethod) {
        return createServerActionError(
          "VALIDATION_ERROR",
          "参加費が必要なため、決済方法を選択してください"
        );
      }

      const paymentValidation = paymentMethodSchema.safeParse(paymentMethod);
      if (!paymentValidation.success) {
        return createServerActionError("VALIDATION_ERROR", "無効な決済方法です");
      }

      validatedPaymentMethod =
        paymentValidation.data as Database["public"]["Enums"]["payment_method_enum"];

      // 決済方法の利用可能性チェック
      if (validatedPaymentMethod === "stripe" && !PAYMENT_METHODS.includes("stripe")) {
        return createServerActionError(
          "EXTERNAL_SERVICE_ERROR",
          "オンライン決済は現在利用できません"
        );
      }
      if (validatedPaymentMethod === "cash" && !PAYMENT_METHODS.includes("cash")) {
        return createServerActionError("EXTERNAL_SERVICE_ERROR", "現金決済は現在利用できません");
      }
    }

    // 決済確定後の決済方法変更を防ぐチェック
    // finalized: 決済が確定し、返金等の処理が必要になる状態
    const finalizedPaymentStatuses: Array<Database["public"]["Enums"]["payment_status_enum"]> = [
      "paid",
      "received",
      "waived",
      "refunded",
    ];

    // finalized 後の決済方法変更をサーバ側でも明示的に拒否
    // 条件: 参加ステータスは変えず（既に attending）、決済方法のみ変更、かつ現在の支払いが finalized
    if (
      attendance.status === "attending" &&
      validatedStatus.data === "attending" &&
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

    // ゲストクライアントを取得してRLSポリシーを適用
    const secureFactory = SecureSupabaseClientFactory.getInstance();
    const guestClient = secureFactory.createGuestClient(guestToken);

    // データベース更新の実行（定員チェックはRPC関数内で実行される）
    // NOTE: `p_event_fee` は冗長に見えるが、以下の理由で呼び出し時に確定した金額を明示的に渡している。
    //   1. 画面表示時点でユーザーが確認した参加費で決済を確定させ、イベント主催者がその後に fee を変更しても影響を受けないようにするため。
    //   2. 将来の早割・クーポン等、ゲストごとに金額が変わる拡張を見越して、個別金額をRPCに渡す設計としている。
    //   3. events.fee をRPC内で都度参照すると、トランザクション外の変更が決済金額に反映され整合性が崩れるリスクがあるため。
    //     （例）fee を 0 → 500 に変更した直後にゲストが「不参加→参加」を送信した場合など。
    const { error } = await guestClient.rpc("update_guest_attendance_with_payment", {
      p_attendance_id: attendance.id,
      p_guest_token: guestToken,
      p_status: validatedStatus.data,
      p_payment_method: validatedPaymentMethod,
      p_event_fee: attendance.event.fee,
    });

    if (error) {
      // RPC関数からのエラーメッセージを安定したコードベースで処理
      const errorCode = error.code || "";
      const errorMessage = error.message || "";

      // 定員超過エラーの検出（RPC関数の実際のエラーメッセージに基づく）
      const isCapacityReached =
        errorMessage.includes("Event capacity") && errorMessage.includes("has been reached");

      // 開発環境では詳細エラーログを出力
      if (process.env.NODE_ENV === "development") {
        const { logger } = await import("@core/logging/app-logger");
        logger.error("Guest attendance update error", {
          tag: "updateGuestAttendance",
          error_code: errorCode,
          error_message: errorMessage,
          attendanceId: attendance.id,
          eventId: attendance.event.id,
          isCapacityReached,
        });
      }

      if (isCapacityReached) {
        return createServerActionError(
          "ATTENDANCE_CAPACITY_REACHED",
          "申し訳ございませんが、定員に達したため参加登録できませんでした"
        );
      }

      return createServerActionError(
        "DATABASE_ERROR",
        "参加状況の更新中にエラーが発生しました。しばらく経ってから再度お試しください"
      );
    }

    // 更新成功時のログ
    if (process.env.NODE_ENV === "development") {
      const { logger } = await import("@core/logging/app-logger");
      logger.info("Guest attendance updated successfully", {
        tag: "updateGuestAttendance",
        attendanceId: attendance.id,
        eventId: attendance.event.id,
        newStatus: validatedStatus.data,
        paymentMethod: validatedPaymentMethod,
      });
    }

    // 決済が必要かどうかを判定
    // 参加で有料の場合、かつ Stripe 決済を選択した場合
    const requiresAdditionalPayment =
      validatedStatus.data === "attending" &&
      attendance.event.fee > 0 &&
      validatedPaymentMethod === "stripe";

    return createServerActionSuccess({
      attendanceId: attendance.id,
      status: validatedStatus.data,
      paymentMethod: validatedPaymentMethod,
      requiresAdditionalPayment,
    });
  } catch (error) {
    // セキュリティログ
    logParticipationSecurityEvent(
      "VALIDATION_FAILURE",
      error instanceof Error ? error.message : "Unknown error in guest attendance update",
      {
        guestToken: guestToken?.substring(0, 4),
      },
      securityContext
    );

    // 本番環境では適切なログシステムでエラーログを記録
    if (process.env.NODE_ENV === "development") {
      const { logger } = await import("@core/logging/app-logger");
      logger.error("Unexpected error in updateGuestAttendanceAction", {
        tag: "updateGuestAttendance",
        error: error instanceof Error ? error.message : String(error),
        guestToken: guestToken?.substring(0, 4),
      });
    }

    return createServerActionError(
      "INTERNAL_ERROR",
      "システムエラーが発生しました。しばらく経ってから再度お試しください",
      { retryable: true }
    );
  }
}
