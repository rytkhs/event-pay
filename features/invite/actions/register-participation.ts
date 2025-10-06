"use server";

import { cookies } from "next/headers";

import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";

import { logger } from "@core/logging/app-logger";
import { NotificationService } from "@core/notification";
import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import {
  logParticipationSecurityEvent,
  logInvalidTokenAccess,
} from "@core/security/security-logger";
import { createClient } from "@core/supabase/server";
import {
  type ServerActionResult,
  createServerActionError,
  createServerActionSuccess,
  zodErrorToServerActionResponse,
} from "@core/types/server-actions";
import { generateGuestToken } from "@core/utils/guest-token";
import {
  validateInviteToken,
  checkEventCapacity,
  checkDuplicateEmail,
} from "@core/utils/invite-token";
import { getSafeHeaders } from "@core/utils/next";
import {
  participationFormSchema,
  createParticipationFormSchema,
  type ParticipationFormData,
  sanitizeParticipationInput,
} from "@core/validation/participation";

import type { Database } from "@/types/database";

// 参加登録結果の型定義
export interface RegisterParticipationData {
  attendanceId: string;
  guestToken: string;
  requiresAdditionalPayment: boolean;
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
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    paymentMethod: rawPaymentMethod?.trim() || undefined, // 意図的に || を使用（空文字もundefinedに変換）
  };

  // 基本的な構造チェックのみ実行（eventFee依存のバリデーションは後で実行）
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
      throw zodErrorToServerActionResponse(error);
    }
    throw createServerActionError("VALIDATION_ERROR", "入力データが無効です");
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
    throw createServerActionError(
      "NOT_FOUND",
      inviteValidation.errorMessage ?? "無効な招待リンクです"
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

    throw createServerActionError(
      "RESOURCE_CONFLICT",
      inviteValidation.errorMessage ?? "このイベントには参加登録できません"
    );
  }

  return {
    event: inviteValidation.event,
  };
}

/**
 * フォームデータの完全バリデーション（eventFee依存）
 */
async function validateFormDataWithEventFee(
  participationData: ParticipationFormData,
  event: ValidatedEventData["event"],
  securityContext: { userAgent?: string; ip?: string }
): Promise<void> {
  // イベント参加費を考慮した完全バリデーション
  const schema = createParticipationFormSchema(event.fee);

  try {
    schema.parse(participationData);
  } catch (error) {
    if (error instanceof z.ZodError) {
      // バリデーションエラーをセキュリティログに記録
      logParticipationSecurityEvent(
        "VALIDATION_FAILURE",
        "Complete form validation failed with event fee context",
        {
          eventFee: event.fee,
          errors: error.errors.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        },
        { ...securityContext, eventId: event.id }
      );
      throw zodErrorToServerActionResponse(error);
    }
    throw createServerActionError("VALIDATION_ERROR", "入力データが無効です");
  }
}

/**
 * 容量チェックの実行
 */
async function validateCapacity(
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

      throw createServerActionError("RESOURCE_CONFLICT", "このイベントは定員に達しています");
    }
  }
}

/**
 * メールアドレス重複チェック（サニタイズ済みメールで実行）
 */
async function validateEmailDuplication(
  sanitizedEmail: string,
  event: ValidatedEventData["event"],
  securityContext: { userAgent?: string; ip?: string }
): Promise<void> {
  // サニタイズ済みメールアドレスの重複チェック
  const isDuplicate = await checkDuplicateEmail(event.id, sanitizedEmail);
  if (isDuplicate) {
    // 重複エラー試行をログに記録
    logParticipationSecurityEvent(
      "DUPLICATE_REGISTRATION",
      "Attempt to register with a duplicate email",
      { eventId: event.id, email: sanitizedEmail },
      { ...securityContext, eventId: event.id }
    );

    throw createServerActionError(
      "DUPLICATE_REGISTRATION",
      "このメールアドレスは既にこのイベントに登録されています"
    );
  }
}

/**
 * 参加データのサニタイゼーション
 */
function sanitizeParticipationData(
  participationData: ParticipationFormData,
  eventId: string,
  securityContext: { userAgent?: string; ip?: string }
): { sanitizedNickname: string; sanitizedEmail: string } {
  const sanitizedNickname = sanitizeParticipationInput.nickname(participationData.nickname, {
    ...securityContext,
    eventId,
  });
  const sanitizedEmail = sanitizeParticipationInput.email(participationData.email, {
    ...securityContext,
    eventId,
  });

  return { sanitizedNickname, sanitizedEmail };
}

/**
 * セキュアなゲストトークンの生成
 */
function generateSecureGuestToken(): string {
  return generateGuestToken();
}

/**
 * サニタイズ済みデータとゲストトークンを統合して処理用データを準備
 */
async function prepareProcessedData(
  participationData: ParticipationFormData,
  event: ValidatedEventData["event"],
  securityContext: { userAgent?: string; ip?: string }
): Promise<ProcessedFormData> {
  // 1. 入力データのサニタイゼーション
  const { sanitizedNickname, sanitizedEmail } = sanitizeParticipationData(
    participationData,
    event.id,
    securityContext
  );

  // 2. ゲストトークンの生成
  const guestToken = generateSecureGuestToken();

  // 3. 処理用データの統合
  return {
    participationData,
    sanitizedNickname,
    sanitizedEmail,
    guestToken,
  };
}

/**
 * PostgrestErrorかどうかを型安全に判定する
 */
function isPostgrestError(error: unknown): error is PostgrestError {
  const maybe = error as Partial<PostgrestError>;
  return (
    error !== null &&
    typeof error === "object" &&
    typeof maybe.code === "string" &&
    typeof maybe.message === "string"
  );
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
  let rpcError: PostgrestError | Error | null = null;

  try {
    // 【セキュリティ強化】負の金額を事前にチェック
    if (event.fee < 0) {
      throw new Error(`Invalid event fee: ${event.fee}. Fee cannot be negative.`);
    }

    // 【重要デバッグ】RPC呼び出しパラメータをログ出力
    const rpcParams = {
      p_event_id: event.id,
      p_nickname: processedData.sanitizedNickname,
      p_email: processedData.sanitizedEmail,
      p_status: processedData.participationData.attendanceStatus,
      p_guest_token: processedData.guestToken,
      p_payment_method: processedData.participationData.paymentMethod,
      p_event_fee: event.fee,
    };

    // RPCは新しく作成されたattendanceのUUID(string形式)を返す
    const rpcResult = await supabase
      .rpc("register_attendance_with_payment", rpcParams)
      .returns<string>()
      .single();

    // RPCの戻り値を型安全に取得
    if (rpcResult.error) {
      rpcError = rpcResult.error;
      newAttendanceId = null;
    } else {
      newAttendanceId = rpcResult.data;
    }
  } catch (rpcCallError) {
    // 型安全にエラーを処理
    rpcError = rpcCallError instanceof Error ? rpcCallError : new Error(String(rpcCallError));
    newAttendanceId = null;
  }

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  if (rpcError || !newAttendanceId) {
    // データベースエラーをセキュリティログに記録（型安全）
    const errorMessage = rpcError?.message ?? "RPC call failed";
    const errorCode = isPostgrestError(rpcError) ? rpcError.code : undefined;
    const errorDetails = isPostgrestError(rpcError) ? rpcError.details : undefined;

    // 【更新】データベース修正後のキャパシティチェックエラーを適切にハンドリング
    if (
      (errorMessage.includes("Event capacity") && errorMessage.includes("has been reached")) ||
      errorMessage.includes("このイベントは定員") ||
      errorMessage.includes("に達しています")
    ) {
      // RPC内部でのキャパシティ超過（レースコンディション対策により検出）
      logParticipationSecurityEvent(
        "CAPACITY_RACE_CONDITION",
        "Race condition prevented: capacity exceeded during RPC execution with exclusive lock",
        {
          eventId: event.id,
          error: errorMessage,
          errorCode,
          errorDetails,
          preventionMethod: "database_exclusive_lock",
        },
        { ...securityContext, eventId: event.id }
      );

      throw createServerActionError("RESOURCE_CONFLICT", "このイベントは定員に達しています");
    }

    // 【更新】データベース修正後のゲストトークン重複エラーを適切にハンドリング（極稀なケース）
    if (
      errorMessage.includes("Guest token already exists") ||
      errorMessage.includes("concurrent request detected")
    ) {
      // 同時リクエストによるトークン衝突またはシステム内部でのトークン衝突（極めて稀）
      const isConcurrentRequest = errorMessage.includes("concurrent request detected");

      logParticipationSecurityEvent(
        "SUSPICIOUS_ACTIVITY",
        isConcurrentRequest
          ? "Concurrent request detected: possible race condition in guest token generation"
          : "Rare guest token collision detected during RPC execution",
        {
          eventId: event.id,
          error: errorMessage,
          errorCode,
          errorDetails,
          tokenLength: processedData.guestToken?.length,
          tokenPrefix: processedData.guestToken?.substring(0, 8),
          detectionType: isConcurrentRequest ? "concurrent_request" : "token_collision",
        },
        { ...securityContext, eventId: event.id }
      );

      throw createServerActionError(
        "INTERNAL_ERROR",
        "システムエラーが発生しました。恐れ入りますが、再度お試しください"
      );
    }

    // 【更新】データベース修正後のメール重複エラーを適切にハンドリング
    if (
      (errorMessage.includes("duplicate key") &&
        (errorMessage.includes("email") ||
          (errorDetails ?? "").includes("attendances_event_email_unique"))) ||
      (errorDetails ?? "").includes("attendances_event_email_unique") ||
      errorMessage.includes("このメールアドレスは既にこのイベントに登録されています")
    ) {
      // 真のメール重複またはレースコンディション後の再チェック結果
      const isRaceConditionResolved = errorMessage.includes("Race condition detected and resolved");

      logParticipationSecurityEvent(
        isRaceConditionResolved ? "CAPACITY_RACE_CONDITION" : "DUPLICATE_REGISTRATION",
        isRaceConditionResolved
          ? "Race condition resolved: capacity reached after exclusive lock check"
          : "Duplicate email registration attempt detected",
        {
          eventId: event.id,
          error: errorMessage,
          errorCode,
          errorDetails,
          email: processedData.sanitizedEmail,
        },
        { ...securityContext, eventId: event.id }
      );

      // レースコンディション解決後の定員超過 vs 真のメール重複を適切に区別
      if (isRaceConditionResolved) {
        throw createServerActionError("RESOURCE_CONFLICT", "このイベントは定員に達しています");
      } else {
        throw createServerActionError(
          "DUPLICATE_REGISTRATION",
          "このメールアドレスは既にこのイベントに登録されています"
        );
      }
    }

    // その他のRPCエラー
    logParticipationSecurityEvent(
      "SUSPICIOUS_ACTIVITY",
      "Database error during attendance creation via RPC",
      {
        eventId: event.id,
        error: errorMessage,
        errorCode,
        errorDetails,
        guestTokenProvided: !!processedData.guestToken,
        guestTokenLength: processedData.guestToken?.length,
      },
      { ...securityContext, eventId: event.id }
    );

    throw createServerActionError("DATABASE_ERROR", "参加登録の処理中にエラーが発生しました");
  }

  // ゲストトークンが正しく保存されたかを検証
  await verifyGuestTokenStorage(newAttendanceId, processedData.guestToken, event, securityContext);

  return newAttendanceId;
}

/**
 * ゲストトークン保存の検証
 *
 * 設計方針:
 * - メイン処理（参加登録）は既に成功しているため、検証失敗時もユーザーエラーは返さない
 * - セキュリティ問題として適切にログ記録し、管理者の監視・対処を可能にする
 * - 将来的にはメトリクス監視によって問題の頻度を追跡し、根本対策を検討する
 */
async function verifyGuestTokenStorage(
  attendanceId: string,
  expectedGuestToken: string,
  event: ValidatedEventData["event"],
  securityContext: { userAgent?: string; ip?: string }
): Promise<void> {
  try {
    const secureClientFactory = SecureSupabaseClientFactory.getInstance();
    const supabase = await secureClientFactory.createGuestClient(expectedGuestToken);

    const { data: savedAttendance, error: verifyError } = await supabase
      .from("attendances")
      .select("id, guest_token")
      .eq("id", attendanceId)
      .single();

    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    if (verifyError || !savedAttendance) {
      logParticipationSecurityEvent(
        "SUSPICIOUS_ACTIVITY",
        "Failed to verify guest token storage",
        {
          eventId: event.id,
          attendanceId,
          error: verifyError?.message ?? "Attendance record not found",
        },
        { ...securityContext, eventId: event.id }
      );
    } else if (savedAttendance.guest_token !== expectedGuestToken) {
      logParticipationSecurityEvent(
        "SUSPICIOUS_ACTIVITY",
        "Guest token mismatch after storage (plain text comparison)",
        {
          eventId: event.id,
          attendanceId,
          expectedTokenLength: expectedGuestToken.length,
          savedTokenLength: savedAttendance.guest_token?.length,
          expectedPrefix: expectedGuestToken.substring(0, 4),
          savedPrefix: savedAttendance.guest_token?.substring(0, 4),
        },
        { ...securityContext, eventId: event.id }
      );
    } else {
      // 検証成功：通常の処理として扱い、詳細ログは開発環境でのみ記録
      if (process.env.NODE_ENV === "development") {
        logParticipationSecurityEvent(
          "SUSPICIOUS_ACTIVITY", // TODO: 将来的にはSUCCESS_AUDITなど専用型を追加
          "Guest token storage verification completed successfully",
          {
            eventId: event.id,
            attendanceId,
            tokenLength: expectedGuestToken.length,
          },
          { ...securityContext, eventId: event.id }
        );
      }
    }
  } catch (verifyException) {
    const errorMessage =
      verifyException instanceof Error ? verifyException.message : "Unknown verification error";

    // SecureSupabaseClientFactory関連のエラーは高優先度で記録（システムインシデント可能性）
    if (
      errorMessage.includes("SecureSupabaseClientFactory") ||
      errorMessage.includes("createGuestClient")
    ) {
      logParticipationSecurityEvent(
        "SUSPICIOUS_ACTIVITY", // 将来的にはSYSTEM_FAILURE等の専用型を検討
        "CRITICAL: SecureSupabaseClientFactory failure detected during guest token verification",
        {
          eventId: event.id,
          attendanceId,
          error: errorMessage,
          severity: "CRITICAL",
          requiresImmediateAttention: true,
          systemComponent: "SecureSupabaseClientFactory",
          operationContext: "guest_token_verification",
        },
        { ...securityContext, eventId: event.id }
      );
    } else {
      // その他の検証エラー（設計意図: UX保持のためユーザーエラーは返さない）
      logParticipationSecurityEvent(
        "SUSPICIOUS_ACTIVITY",
        "Guest token verification failed but continuing main process (by design for UX)",
        {
          eventId: event.id,
          attendanceId,
          error: errorMessage,
          designNote: "User experience prioritized over strict security validation at this stage",
        },
        { ...securityContext, eventId: event.id }
      );
    }
  }
}

/**
 * 参加登録を処理するサーバーアクション
 * セキュリティ対策強化版：容量チェック、重複チェック、ゲストトークン生成、セキュリティログ記録を含む
 */
export async function registerParticipationAction(
  formData: FormData
): Promise<ServerActionResult<RegisterParticipationData>> {
  // リクエスト情報を取得（テスト環境でも安全）
  const { context: securityContext } = await getSafeHeaders();

  try {
    // 1. FormDataの抽出と基本バリデーション
    const participationData = await extractAndValidateFormData(formData, securityContext);

    // 2. 招待トークンの検証とイベント情報の取得
    const { event } = await validateInviteAndEvent(participationData, securityContext);

    // 3. イベント参加費を考慮した完全バリデーション
    await validateFormDataWithEventFee(participationData, event, securityContext);

    // 4. 容量チェック（サニタイゼーション前に実行）
    await validateCapacity(participationData, event, securityContext);

    // 5. データのサニタイゼーションとゲストトークン生成
    const processedData = await prepareProcessedData(participationData, event, securityContext);

    // 6. メール重複チェック（サニタイズ済みメールアドレスで実行）
    await validateEmailDuplication(processedData.sanitizedEmail, event, securityContext);

    // 7. データベース操作の実行
    const newAttendanceId = await executeRegistration(processedData, event, securityContext);

    // 8. 決済が必要かどうかの判定
    const requiresAdditionalPayment =
      participationData.attendanceStatus === "attending" && event.fee > 0;

    // 9. 成功レスポンスの作成
    const responseData: RegisterParticipationData = {
      attendanceId: newAttendanceId,
      guestToken: processedData.guestToken,
      requiresAdditionalPayment,
      eventTitle: event.title,
      participantNickname: processedData.sanitizedNickname,
      participantEmail: processedData.sanitizedEmail,
      attendanceStatus: participationData.attendanceStatus,
      paymentMethod: participationData.paymentMethod,
    };
    // 10. 申込成功状態をHttpOnlyクッキーで12時間保持（パスは該当招待リンクのみに限定）
    try {
      const cookieStore = cookies();
      const twelveHoursMs = 12 * 60 * 60 * 1000;
      const expiresAt = new Date(Date.now() + twelveHoursMs);
      cookieStore.set("invite_success", responseData.guestToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: `/invite/${participationData.inviteToken}`,
        expires: expiresAt,
      });
    } catch {
      // クッキー設定失敗はUX低下に留めるため、ユーザー向けエラーにはしない
    }

    // 11. 参加登録完了通知を送信（失敗してもログのみ記録）
    try {
      const supabase = createClient();
      const notificationService = new NotificationService(supabase);
      await notificationService.sendParticipationRegisteredNotification({
        email: processedData.sanitizedEmail,
        nickname: processedData.sanitizedNickname,
        eventTitle: event.title,
        eventDate: event.date,
        attendanceStatus: participationData.attendanceStatus,
        guestToken: processedData.guestToken,
        inviteToken: participationData.inviteToken,
      });
    } catch (error) {
      // 通知失敗はログのみ記録、本処理は継続
      logger.warn("Failed to send participation notification", {
        tag: "participationNotification",
        attendanceId: newAttendanceId,
        error_message: error instanceof Error ? error.message : "Unknown error",
      });
    }

    return createServerActionSuccess(responseData, "参加登録が完了しました");
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

    return createServerActionError("INTERNAL_ERROR", "参加登録の処理中にエラーが発生しました");
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
    // paymentMethodはundefinedの場合も空文字として送信（バリデーション一貫性のため）
    formData.append("paymentMethod", participationData.paymentMethod ?? "");

    return await registerParticipationAction(formData);
  } catch (error) {
    // エラー詳細をセキュリティログに記録
    logParticipationSecurityEvent(
      "SUSPICIOUS_ACTIVITY",
      "Unexpected error in direct participation registration",
      {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      { userAgent: "direct-action", ip: "internal" }
    );

    return createServerActionError("INTERNAL_ERROR", "参加登録の処理中にエラーが発生しました");
  }
}
