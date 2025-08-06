"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { generateGuestToken } from "@/lib/utils/guest-token";

import {
  validateInviteToken,
  checkEventCapacity,
  checkDuplicateEmail as _checkDuplicateEmail,
} from "@/lib/utils/invite-token";
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
import { getClientIPFromHeaders } from "@/lib/utils/ip-detection";
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

// 内部処理用のデータ型定義
interface ProcessedFormData {
  participationData: ParticipationFormData;
  sanitizedNickname: string;
  sanitizedEmail: string;
  guestToken: string;
}

interface ValidatedEventData {
  event: NonNullable<Awaited<ReturnType<typeof validateInviteToken>>["event"]>;
  canRegister: boolean;
}

/**
 * FormDataから参加データを抽出し、基本バリデーションを実行
 */
async function extractAndValidateFormData(
  formData: FormData,
  securityContext: { userAgent?: string; ip?: string }
): Promise<ParticipationFormData> {
  const rawPaymentMethod = formData.get("paymentMethod") as string | null;
  const rawData = {
    inviteToken: formData.get("inviteToken") as string,
    nickname: formData.get("nickname") as string,
    email: formData.get("email") as string,
    attendanceStatus: formData.get("attendanceStatus") as string,
    paymentMethod: rawPaymentMethod && rawPaymentMethod.trim() ? rawPaymentMethod : undefined,
  };

  try {
    return participationFormSchema.parse(rawData);
  } catch (error) {
    if (error instanceof z.ZodError) {
      // バリデーションエラーをセキュリティログに記録
      logParticipationSecurityEvent(
        "VALIDATION_FAILURE",
        "Participation form validation failed",
        {
          errors: error.errors.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        },
        securityContext
      );
      throw zodErrorToResponse(error);
    }
    throw createErrorResponse(ERROR_CODES.VALIDATION_ERROR, "入力データが無効です");
  }
}

/**
 * 招待トークンの検証とイベント情報の取得
 */
async function validateInviteAndEvent(
  participationData: ParticipationFormData,
  securityContext: { userAgent?: string; ip?: string }
): Promise<ValidatedEventData> {
  const inviteValidation = await validateInviteToken(participationData.inviteToken);

  if (!inviteValidation.isValid || !inviteValidation.event) {
    // 無効なトークンアクセスをログに記録
    logInvalidTokenAccess(participationData.inviteToken, "invite", securityContext);
    throw createErrorResponse(
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
      { ...securityContext, eventId: inviteValidation.event?.id }
    );

    throw createErrorResponse(
      ERROR_CODES.BUSINESS_RULE_VIOLATION,
      inviteValidation.errorMessage || "このイベントには参加登録できません"
    );
  }

  return {
    event: inviteValidation.event,
    canRegister: inviteValidation.canRegister,
  };
}

/**
 * 容量チェックと重複チェックの実行
 */
async function validateCapacityAndDuplication(
  participationData: ParticipationFormData,
  event: ValidatedEventData["event"],
  securityContext: { userAgent?: string; ip?: string }
): Promise<void> {
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
        { ...securityContext, eventId: event.id }
      );

      throw createErrorResponse(
        ERROR_CODES.BUSINESS_RULE_VIOLATION,
        "このイベントは定員に達しています"
      );
    }
  }

  // メールアドレスの重複チェック（ユーザビリティ改善のため事前チェック）
  const isDuplicate = await _checkDuplicateEmail(event.id, participationData.email);
  if (isDuplicate) {
    // 重複エラー試行をログに記録
    logParticipationSecurityEvent(
      "DUPLICATE_REGISTRATION",
      "Attempt to register with a duplicate email",
      { eventId: event.id, email: participationData.email },
      { ...securityContext, eventId: event.id }
    );

    throw createErrorResponse(
      ERROR_CODES.CONFLICT,
      "このメールアドレスは既にこのイベントに登録されています"
    );
  }

  // 包括的なバリデーションと重複チェック（セキュリティログ付き）
  const validationErrors = await validateParticipationFormWithDuplicateCheck(
    participationData,
    event.id,
    securityContext
  );

  if (Object.keys(validationErrors).length > 0) {
    throw createErrorResponse(
      ERROR_CODES.CONFLICT,
      validationErrors.email || validationErrors.general || "入力データに問題があります"
    );
  }
}

/**
 * データのサニタイゼーションとゲストトークン生成
 */
async function sanitizeAndPrepareData(
  participationData: ParticipationFormData,
  event: ValidatedEventData["event"],
  securityContext: { userAgent?: string; ip?: string }
): Promise<ProcessedFormData> {
  // 入力データのサニタイゼーション（セキュリティログ付き）
  const sanitizedNickname = sanitizeParticipationInput.nickname(participationData.nickname, {
    ...securityContext,
    eventId: event.id,
  });
  const sanitizedEmail = sanitizeParticipationInput.email(participationData.email, {
    ...securityContext,
    eventId: event.id,
  });

  // ゲストトークンの生成
  let guestToken: string;
  try {
    guestToken = generateGuestToken();
  } catch (tokenError) {
    // トークン生成失敗をセキュリティログに記録
    logParticipationSecurityEvent(
      "SUSPICIOUS_ACTIVITY",
      "Guest token generation failed",
      {
        eventId: event.id,
        error: tokenError instanceof Error ? tokenError.message : "Unknown error",
      },
      { ...securityContext, eventId: event.id }
    );

    throw createErrorResponse(ERROR_CODES.INTERNAL_ERROR, "参加登録の処理中にエラーが発生しました");
  }

  return {
    participationData,
    sanitizedNickname,
    sanitizedEmail,
    guestToken,
  };
}

/**
 * データベース操作の実行
 */
async function executeRegistration(
  processedData: ProcessedFormData,
  event: ValidatedEventData["event"],
  securityContext: { userAgent?: string; ip?: string }
): Promise<string> {
  const supabase = createClient();

  let newAttendanceId: string | null = null;
  let rpcError: { message: string; code?: string; details?: string } | null = null;

  try {
    const rpcResult = await supabase
      .rpc("register_attendance_with_payment", {
        p_event_id: event.id,
        p_nickname: processedData.sanitizedNickname,
        p_email: processedData.sanitizedEmail,
        p_status: processedData.participationData.attendanceStatus,
        p_guest_token: processedData.guestToken,
        p_payment_method: processedData.participationData.paymentMethod,
        p_event_fee: event.fee,
      })
      .single();

    newAttendanceId = rpcResult.data as string | null;
    rpcError = rpcResult.error as { message: string; code?: string; details?: string } | null;
  } catch (rpcCallError) {
    rpcError = rpcCallError as { message: string; code?: string; details?: string };
  }

  if (rpcError || !newAttendanceId) {
    // データベースエラーをセキュリティログに記録
    logParticipationSecurityEvent(
      "SUSPICIOUS_ACTIVITY",
      "Database error during attendance creation via RPC",
      {
        eventId: event.id,
        error: rpcError?.message || "RPC call failed",
        errorCode: rpcError?.code,
        errorDetails: rpcError?.details,
        guestTokenProvided: !!processedData.guestToken,
        guestTokenLength: processedData.guestToken?.length,
      },
      { ...securityContext, eventId: event.id }
    );

    throw createErrorResponse(ERROR_CODES.DATABASE_ERROR, "参加登録の処理中にエラーが発生しました");
  }

  // ゲストトークンが正しく保存されたかを検証
  await verifyGuestTokenStorage(newAttendanceId, processedData.guestToken, event, securityContext);

  return newAttendanceId;
}

/**
 * ゲストトークン保存の検証
 */
async function verifyGuestTokenStorage(
  attendanceId: string,
  expectedGuestToken: string,
  event: ValidatedEventData["event"],
  securityContext: { userAgent?: string; ip?: string }
): Promise<void> {
  try {
    const supabase = createClient();
    const { data: savedAttendance, error: verifyError } = await supabase
      .from("attendances")
      .select("id, guest_token")
      .eq("id", attendanceId)
      .single();

    if (verifyError || !savedAttendance) {
      logParticipationSecurityEvent(
        "SUSPICIOUS_ACTIVITY",
        "Failed to verify guest token storage",
        {
          eventId: event.id,
          attendanceId,
          error: verifyError?.message || "Attendance record not found",
        },
        { ...securityContext, eventId: event.id }
      );
    } else if (savedAttendance.guest_token !== expectedGuestToken) {
      logParticipationSecurityEvent(
        "SUSPICIOUS_ACTIVITY",
        "Guest token mismatch after storage",
        {
          eventId: event.id,
          attendanceId,
          expectedTokenLength: expectedGuestToken.length,
          savedTokenLength: savedAttendance.guest_token?.length,
        },
        { ...securityContext, eventId: event.id }
      );
    }
  } catch (_verifyException) {
    // 検証エラーは記録するが、メイン処理は続行する
  }
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
  const ip = getClientIPFromHeaders(headersList);
  const securityContext = { userAgent, ip };

  try {
    // 1. FormDataの抽出と基本バリデーション
    const participationData = await extractAndValidateFormData(formData, securityContext);

    // 2. 招待トークンの検証とイベント情報の取得
    const { event } = await validateInviteAndEvent(participationData, securityContext);

    // 3. 容量チェックと重複チェック
    await validateCapacityAndDuplication(participationData, event, securityContext);

    // 4. データのサニタイゼーションとゲストトークン生成
    const processedData = await sanitizeAndPrepareData(participationData, event, securityContext);

    // 5. データベース操作の実行
    const newAttendanceId = await executeRegistration(processedData, event, securityContext);

    // 6. 決済が必要かどうかの判定
    const requiresPayment = participationData.attendanceStatus === "attending" && event.fee > 0;

    // 7. 成功レスポンスの作成
    const responseData: RegisterParticipationData = {
      attendanceId: newAttendanceId,
      guestToken: processedData.guestToken,
      requiresPayment,
      eventTitle: event.title,
      participantNickname: processedData.sanitizedNickname,
      participantEmail: processedData.sanitizedEmail,
      attendanceStatus: participationData.attendanceStatus,
      paymentMethod: participationData.paymentMethod,
    };

    return createSuccessResponse(responseData, "参加登録が完了しました");
  } catch (error) {
    // エラーが既にServerActionResultの場合はそのまま返す
    if (error && typeof error === "object" && "success" in error) {
      return error as ServerActionResult<RegisterParticipationData>;
    }

    // 予期しないエラーをセキュリティログに記録
    logParticipationSecurityEvent(
      "SUSPICIOUS_ACTIVITY",
      "Unexpected error in participation registration",
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      securityContext
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
