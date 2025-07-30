"use server";

import { z } from "zod";
import { randomBytes } from "crypto";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

import { validateInviteToken, checkEventCapacity, checkDuplicateEmail } from "@/lib/utils/invite-token";
import {
  participationFormSchema,
  type ParticipationFormData,
  validateParticipationFormWithDuplicateCheck,
  sanitizeParticipationInput,
} from "@/lib/validations/participation";
import {
  type ServerActionResult,
  createErrorResponse,
  createSuccessResponse,
  zodErrorToResponse,
  ERROR_CODES,
} from "@/lib/types/server-actions";
import {
  logParticipationSecurityEvent,
  logInvalidTokenAccess,
} from "@/lib/security/security-logger";
import { getClientIP } from "@/lib/utils/ip-detection";
import type { Database } from "@/types/database";

// 参加登録結果の型定義
export interface RegisterParticipationData {
  attendanceId: string;
  guestToken: string;
  requiresPayment: boolean;
  eventTitle: string;
  participantNickname: string;
  participantEmail: string;
  attendanceStatus: Database["public"]["Enums"]["attendance_status_enum"];
  paymentMethod?: Database["public"]["Enums"]["payment_method_enum"];
}

/**
 * ゲストトークンを生成する関数
 * 24バイトのランダムデータをURLセーフなBase64でエンコード（32文字）
 */
function generateGuestToken(): string {
  return randomBytes(24)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * 参加登録を処理するサーバーアクション
 * セキュリティ対策強化版：容量チェック、重複チェック、ゲストトークン生成、セキュリティログ記録を含む
 */
export async function registerParticipationAction(
  formData: FormData
): Promise<ServerActionResult<RegisterParticipationData>> {
  // リクエスト情報を取得（セキュリティログ用）
  const headersList = headers();
  const userAgent = headersList.get("user-agent") || undefined;
  const ip = getClientIP(headersList);

  try {
    // FormDataから参加データを抽出
    const rawData = {
      inviteToken: formData.get("inviteToken") as string,
      nickname: formData.get("nickname") as string,
      email: formData.get("email") as string,
      attendanceStatus: formData.get("attendanceStatus") as string,
      paymentMethod: formData.get("paymentMethod") as string | undefined,
    };

    // 基本的な入力検証
    let participationData: ParticipationFormData;
    try {
      participationData = participationFormSchema.parse(rawData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        // バリデーションエラーをセキュリティログに記録
        logParticipationSecurityEvent(
          "VALIDATION_FAILURE",
          "Participation form validation failed",
          {
            errors: error.errors.map(e => ({
              field: e.path.join("."),
              message: e.message,
            })),
          },
          { userAgent, ip }
        );
        return zodErrorToResponse(error);
      }
      return createErrorResponse(ERROR_CODES.VALIDATION_ERROR, "入力データが無効です");
    }

    // 招待トークンの検証とイベント情報の取得
    const inviteValidation = await validateInviteToken(participationData.inviteToken);

    if (!inviteValidation.isValid || !inviteValidation.event) {
      // 無効なトークンアクセスをログに記録
      logInvalidTokenAccess(participationData.inviteToken, "invite", { userAgent, ip });

      return createErrorResponse(
        ERROR_CODES.NOT_FOUND,
        inviteValidation.errorMessage || "無効な招待リンクです"
      );
    }

    if (!inviteValidation.canRegister) {
      // 登録不可能なイベントへのアクセス試行をログに記録
      logParticipationSecurityEvent(
        "DEADLINE_BYPASS_ATTEMPT",
        "Attempt to register for unavailable event",
        {
          eventId: inviteValidation.event?.id,
          eventStatus: inviteValidation.event?.status,
          errorMessage: inviteValidation.errorMessage,
        },
        { userAgent, ip, eventId: inviteValidation.event?.id }
      );

      return createErrorResponse(
        ERROR_CODES.BUSINESS_RULE_VIOLATION,
        inviteValidation.errorMessage || "このイベントには参加登録できません"
      );
    }

    const event = inviteValidation.event;

    // 参加ステータスが"attending"の場合の容量チェック
    if (participationData.attendanceStatus === "attending") {
      const isCapacityReached = await checkEventCapacity(event.id, event.capacity);
      if (isCapacityReached) {
        // 定員超過試行をログに記録
        logParticipationSecurityEvent(
          "CAPACITY_BYPASS_ATTEMPT",
          "Attempt to register for full capacity event",
          {
            eventId: event.id,
            currentCapacity: event.attendances_count,
            maxCapacity: event.capacity,
          },
          { userAgent, ip, eventId: event.id }
        );

        return createErrorResponse(
          ERROR_CODES.BUSINESS_RULE_VIOLATION,
          "このイベントは定員に達しています"
        );
      }
    }

    // 包括的なバリデーションと重複チェック（セキュリティログ付き）
    const validationErrors = await validateParticipationFormWithDuplicateCheck(
      participationData,
      event.id,
      { userAgent, ip }
    );

    if (Object.keys(validationErrors).length > 0) {
      // 重複登録やその他のバリデーションエラーは既にログに記録済み
      return createErrorResponse(
        ERROR_CODES.CONFLICT,
        validationErrors.email || validationErrors.general || "入力データに問題があります"
      );
    }

    // Supabaseクライアントの作成
    const supabase = createClient();

    // ゲストトークンの生成
    const guestToken = generateGuestToken();

    // 入力データのサニタイゼーション（セキュリティログ付き）
    const sanitizedNickname = sanitizeParticipationInput.nickname(
      participationData.nickname,
      { userAgent, ip, eventId: event.id }
    );
    const sanitizedEmail = sanitizeParticipationInput.email(
      participationData.email,
      { userAgent, ip, eventId: event.id }
    );

    // 参加記録の作成
    const { data: attendance, error: attendanceError } = await supabase
      .from("attendances")
      .insert({
        event_id: event.id,
        nickname: sanitizedNickname,
        email: sanitizedEmail,
        status: participationData.attendanceStatus,
        guest_token: guestToken,
      })
      .select("id")
      .single();

    if (attendanceError || !attendance) {
      // データベースエラーをセキュリティログに記録
      logParticipationSecurityEvent(
        "SUSPICIOUS_ACTIVITY",
        "Database error during attendance creation",
        {
          eventId: event.id,
          error: attendanceError?.message,
        },
        { userAgent, ip, eventId: event.id }
      );

      return createErrorResponse(
        ERROR_CODES.DATABASE_ERROR,
        "参加登録の処理中にエラーが発生しました"
      );
    }

    // 決済が必要な場合（参加ステータスが"attending"かつ有料イベント）の決済記録作成
    let requiresPayment = false;
    if (participationData.attendanceStatus === "attending" && event.fee > 0 && participationData.paymentMethod) {
      requiresPayment = true;

      // StripeとCashの両方でpendingステータスの決済レコードを作成
      const { error: paymentError } = await supabase
        .from("payments")
        .insert({
          attendance_id: attendance.id,
          amount: event.fee,
          method: participationData.paymentMethod,
          status: "pending", // 初期状態は常にpending（StripeもCashも）
        });

      if (paymentError) {
        // 決済記録作成エラーをセキュリティログに記録
        logParticipationSecurityEvent(
          "SUSPICIOUS_ACTIVITY",
          "Database error during payment record creation",
          {
            eventId: event.id,
            attendanceId: attendance.id,
            error: paymentError.message,
          },
          { userAgent, ip, eventId: event.id }
        );

        // 決済記録の作成に失敗した場合、参加記録も削除してロールバック
        await supabase
          .from("attendances")
          .delete()
          .eq("id", attendance.id);

        return createErrorResponse(
          ERROR_CODES.DATABASE_ERROR,
          "決済記録の作成中にエラーが発生しました"
        );
      }
    }

    // 成功レスポンスの作成
    const responseData: RegisterParticipationData = {
      attendanceId: attendance.id,
      guestToken,
      requiresPayment,
      eventTitle: event.title,
      participantNickname: sanitizedNickname,
      participantEmail: sanitizedEmail,
      attendanceStatus: participationData.attendanceStatus,
      paymentMethod: participationData.paymentMethod,
    };

    return createSuccessResponse(responseData, "参加登録が完了しました");

  } catch (error) {
    // 予期しないエラーをセキュリティログに記録
    logParticipationSecurityEvent(
      "SUSPICIOUS_ACTIVITY",
      "Unexpected error in participation registration",
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { userAgent, ip }
    );

    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      "参加登録の処理中にエラーが発生しました"
    );
  }
}

/**
 * 参加登録データの直接処理版（FormDataではなく型安全なオブジェクトを受け取る）
 * テストやAPIエンドポイントから使用される
 */
export async function registerParticipationDirectAction(
  participationData: ParticipationFormData
): Promise<ServerActionResult<RegisterParticipationData>> {
  try {
    // FormDataを模擬してメインの処理を再利用
    const formData = new FormData();
    formData.append("inviteToken", participationData.inviteToken);
    formData.append("nickname", participationData.nickname);
    formData.append("email", participationData.email);
    formData.append("attendanceStatus", participationData.attendanceStatus);
    if (participationData.paymentMethod) {
      formData.append("paymentMethod", participationData.paymentMethod);
    }

    return await registerParticipationAction(formData);
  } catch (_error) {
    return createErrorResponse(
      ERROR_CODES.INTERNAL_ERROR,
      "参加登録の処理中にエラーが発生しました"
    );
  }
}