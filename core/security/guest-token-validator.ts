/**
 * EventPay RLSベースゲストトークンバリデーター
 *
 * 管理者権限を使用せず、RLSポリシーベースのアクセス制御により
 * ゲストトークンの検証と参加情報の取得を行う
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logToSystemLogs } from "@core/logging/system-logger";
import { type GuestAttendanceData as GlobalGuestAttendanceData } from "@core/types/guest";
import type { RpcGuestGetAttendanceRow } from "@core/types/invite";
import { handleServerError } from "@core/utils/error-handler.server";
import { sanitizeForEventPay } from "@core/utils/sanitize";
import { isValidIsoDateTimeString } from "@core/utils/timezone";

import type { Database } from "@/types/database";

import { validateGuestTokenFormat } from "./crypto";
import { GuestErrorCode, GuestTokenErrorFactory } from "./guest-token-errors";
import { getSecureClientFactory } from "./secure-client-factory.impl";
import { IGuestTokenValidator } from "./secure-client-factory.interface";
import {
  GuestValidationResult,
  GuestSession,
  GuestPermission,
  EventInfo,
} from "./secure-client-factory.types";

/**
 * RLSベースゲストトークン検証結果
 */
export interface RLSGuestTokenValidationResult {
  isValid: boolean;
  attendance?: GlobalGuestAttendanceData;
  errorMessage?: string;
  canModify: boolean;
  errorCode?: GuestErrorCode;
  session?: GuestSession;
}

/**
 * RLSポリシーベースのゲストトークンバリデーター実装
 *
 * 特徴:
 * - 管理者権限を使用しない
 * - RLSポリシーによる透過的なアクセス制御
 * - セキュリティ監査ログの自動記録
 * - エラーハンドリングの強化
 */
export class RLSGuestTokenValidator implements IGuestTokenValidator {
  private readonly clientFactory = getSecureClientFactory();

  constructor() {}

  /**
   * ゲストトークンを検証し、参加データを取得
   *
   * RLSポリシーを使用してトークンの有効性を確認し、
   * 関連する参加情報とイベント情報を取得します。
   *
   * @param token ゲストトークン
   * @returns 検証結果と参加データ
   */
  async validateToken(token: string): Promise<GuestValidationResult> {
    // 基本フォーマット検証
    if (!this.validateTokenFormat(token)) {
      await this.safeLogGuestAccess(token, "guest.validate", false, {
        errorCode: GuestErrorCode.INVALID_FORMAT,
        tableName: "attendances",
        operationType: "SELECT",
      });

      return {
        isValid: false,
        errorCode: GuestErrorCode.INVALID_FORMAT,
        canModify: false,
      };
    }

    try {
      // ゲストクライアントを使用してRLSポリシーを有効化
      const guestClient = this.clientFactory.createGuestClient(token) as SupabaseClient<Database>;

      // 公開RPCに置換（最小列）
      const { data: rpcRow, error } = await guestClient
        .rpc("rpc_guest_get_attendance", { p_guest_token: token })
        .single();

      if (error || !rpcRow) {
        await this.safeLogGuestAccess(token, "guest.validate", false, {
          errorCode: GuestErrorCode.TOKEN_NOT_FOUND,
          errorMessage: error?.message,
          tableName: "attendances",
          operationType: "SELECT",
          resultCount: 0,
        });

        return {
          isValid: false,
          errorCode: GuestErrorCode.TOKEN_NOT_FOUND,
          canModify: false,
        };
      }

      // RPCの最小列からイベント情報を正規化
      const eventData = this.buildEventInfoFromRpcRow(rpcRow);
      const canModify = this.checkCanModify(eventData);

      // 成功をログに記録
      await this.safeLogGuestAccess(token, "guest.validate", true, {
        attendanceId: rpcRow.attendance_id,
        eventId: eventData.id,
        tableName: "attendances",
        operationType: "SELECT",
        resultCount: 1,
      });

      return {
        isValid: true,
        attendanceId: rpcRow.attendance_id,
        eventId: eventData.id,
        canModify,
      };
    } catch (error) {
      // データベースアクセスエラーやその他の例外
      await this.safeLogGuestAccess(token, "guest.validate", false, {
        errorCode: GuestErrorCode.TOKEN_NOT_FOUND,
        errorMessage: String(error),
        tableName: "attendances",
        operationType: "SELECT",
      });

      return {
        isValid: false,
        errorCode: GuestErrorCode.TOKEN_NOT_FOUND,
        canModify: false,
      };
    }
  }

  /**
   * 詳細な参加データを取得（従来のvalidateGuestToken互換）
   *
   * @param token ゲストトークン
   * @returns 詳細な検証結果と参加データ
   */
  async validateGuestTokenWithDetails(token: string): Promise<RLSGuestTokenValidationResult> {
    // 基本フォーマット検証
    if (!this.validateTokenFormat(token)) {
      await this.safeLogGuestAccess(token, "guest.read", false, {
        errorCode: GuestErrorCode.INVALID_FORMAT,
        tableName: "attendances",
        operationType: "SELECT",
      });

      return {
        isValid: false,
        errorMessage: "無効なゲストトークンの形式です",
        canModify: false,
        errorCode: GuestErrorCode.INVALID_FORMAT,
      };
    }

    try {
      const guestClient = this.clientFactory.createGuestClient(token) as SupabaseClient<Database>;

      // 詳細な参加データを取得（最新支払い1件を含む）
      const { data: rpcRow, error } = await guestClient
        .rpc("rpc_guest_get_attendance", { p_guest_token: token })
        .single();

      if (error || !rpcRow) {
        await this.safeLogGuestAccess(token, "guest.read", false, {
          errorCode: GuestErrorCode.TOKEN_NOT_FOUND,
          errorMessage: error?.message,
          tableName: "attendances",
          operationType: "SELECT",
          resultCount: 0,
        });

        return {
          isValid: false,
          errorMessage: "参加データが見つかりません",
          canModify: false,
          errorCode: GuestErrorCode.TOKEN_NOT_FOUND,
        };
      }

      const eventData = this.buildGuestEventFromRpcRow(rpcRow);

      const canModify = this.checkCanModifyAttendance(eventData);

      // 成功をログに記録
      await this.safeLogGuestAccess(token, "guest.read", true, {
        attendanceId: rpcRow.attendance_id,
        eventId: eventData.id,
        tableName: "attendances",
        operationType: "SELECT",
        resultCount: 1,
      });

      const payment = this.buildGuestPaymentFromRpcRow(rpcRow);

      return {
        isValid: true,
        attendance: {
          id: rpcRow.attendance_id,
          nickname: rpcRow.nickname,
          email: rpcRow.email,
          status: rpcRow.status,
          guest_token: rpcRow.guest_token,
          created_at: rpcRow.attendance_created_at,
          updated_at: rpcRow.attendance_updated_at,
          event: {
            ...eventData,
            title: sanitizeForEventPay(rpcRow.event_title),
          },
          payment,
        },
        canModify,
      };
    } catch (error) {
      await this.safeLogGuestAccess(token, "guest.read", false, {
        errorCode: GuestErrorCode.TOKEN_NOT_FOUND,
        errorMessage: String(error),
        tableName: "attendances",
        operationType: "SELECT",
      });

      return {
        isValid: false,
        errorMessage: "参加データの取得中にエラーが発生しました",
        canModify: false,
        errorCode: GuestErrorCode.TOKEN_NOT_FOUND,
      };
    }
  }

  /**
   * ゲストセッションを作成
   *
   * 検証済みのトークンからゲストセッション情報を作成します。
   *
   * @param token ゲストトークン
   * @returns ゲストセッション情報
   */
  async createGuestSession(token: string): Promise<GuestSession> {
    const validationResult = await this.validateToken(token);

    if (!validationResult.isValid || !validationResult.attendanceId || !validationResult.eventId) {
      throw GuestTokenErrorFactory.tokenNotFound();
    }

    // セッション有効期限を設定（イベント開始時刻まで、または24時間後のいずれか短い方）
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // デフォルト24時間

    // 基本的な権限を設定
    const permissions: GuestPermission[] = [
      GuestPermission.READ_ATTENDANCE,
      GuestPermission.READ_EVENT,
      GuestPermission.READ_PAYMENT,
    ];

    if (validationResult.canModify) {
      permissions.push(GuestPermission.UPDATE_ATTENDANCE);
    }

    // セッション作成をログに記録
    await this.safeLogGuestAccess(token, "guest.access", true, {
      attendanceId: validationResult.attendanceId,
      eventId: validationResult.eventId,
      operationType: "SELECT",
    });

    return {
      token,
      attendanceId: validationResult.attendanceId,
      eventId: validationResult.eventId,
      expiresAt,
      permissions,
    };
  }

  /**
   * 変更権限をチェック
   *
   * イベントの開始時刻と登録締切を確認し、
   * ゲストが参加情報を変更可能かどうかを判定します。
   *
   * @param token ゲストトークン
   * @returns 変更可能かどうか
   */
  async checkModificationPermissions(token: string): Promise<boolean> {
    const validationResult = await this.validateToken(token);
    return validationResult.canModify;
  }

  /**
   * トークンの基本フォーマットを検証
   *
   * トークンの長さと文字種をチェックします。
   *
   * @param token ゲストトークン
   * @returns フォーマットが有効かどうか
   */
  validateTokenFormat(token: string): boolean {
    return validateGuestTokenFormat(token);
  }

  /**
   * ゲストクライアントを作成
   *
   * 検証済みトークンでゲストクライアントを作成します。
   *
   * @param token 検証済みゲストトークン
   * @returns ゲスト用Supabaseクライアント
   */
  createGuestClient(token: string): SupabaseClient {
    if (!this.validateTokenFormat(token)) {
      throw GuestTokenErrorFactory.invalidFormat(token.length);
    }

    return this.clientFactory.createGuestClient(token);
  }

  // ====================================================================
  // プライベートヘルパーメソッド
  // ====================================================================

  /**
   * 日付文字列の有効性をチェック
   */
  private isValidDateString(dateStr: string): boolean {
    return isValidIsoDateTimeString(dateStr);
  }

  private buildEventInfoFromRpcRow(rpcRow: RpcGuestGetAttendanceRow): EventInfo {
    return {
      id: rpcRow.event_id,
      date: rpcRow.event_date,
      registration_deadline: rpcRow.registration_deadline ?? null,
      canceled_at: rpcRow.canceled_at ?? null,
    };
  }

  private buildGuestEventFromRpcRow(
    rpcRow: RpcGuestGetAttendanceRow
  ): GlobalGuestAttendanceData["event"] {
    return {
      id: rpcRow.event_id,
      title: rpcRow.event_title,
      date: rpcRow.event_date,
      location: rpcRow.event_location,
      fee: rpcRow.event_fee,
      capacity: rpcRow.event_capacity,
      description: rpcRow.event_description,
      payment_methods: rpcRow.event_payment_methods,
      allow_payment_after_deadline: rpcRow.event_allow_payment_after_deadline,
      grace_period_days: rpcRow.event_grace_period_days,
      registration_deadline: rpcRow.registration_deadline ?? null,
      payment_deadline: rpcRow.payment_deadline ?? null,
      created_by: rpcRow.created_by,
      canceled_at: rpcRow.canceled_at ?? null,
    };
  }

  private buildGuestPaymentFromRpcRow(
    rpcRow: RpcGuestGetAttendanceRow
  ): GlobalGuestAttendanceData["payment"] {
    if (!rpcRow.payment_id) {
      return null;
    }

    return {
      id: rpcRow.payment_id,
      amount: Number(rpcRow.payment_amount),
      method: rpcRow.payment_method,
      status: rpcRow.payment_status,
      created_at: rpcRow.payment_created_at,
    };
  }

  /**
   * イベント情報から変更可能性を判定
   */
  private checkCanModify(event: EventInfo): boolean {
    // 日付の妥当性をチェック
    if (!this.isValidDateString(event.date)) {
      return false;
    }

    const now = new Date();
    const eventDate = new Date(event.date);

    // 登録締切の処理
    let registrationDeadline: Date | null = null;
    if (event.registration_deadline) {
      if (!this.isValidDateString(event.registration_deadline)) {
        return false;
      }
      registrationDeadline = new Date(event.registration_deadline);
    }

    // イベント開始前かつ登録締切前かつアクティブ状態
    const isBeforeEventStart = eventDate > now;
    const isBeforeDeadline = registrationDeadline === null || registrationDeadline > now;
    const notCanceled = !event.canceled_at;

    return isBeforeEventStart && isBeforeDeadline && notCanceled;
  }

  /**
   * 参加状況を変更可能かどうかを判定する（従来互換）
   */
  private checkCanModifyAttendance(event: GlobalGuestAttendanceData["event"]): boolean {
    const now = new Date();

    // キャンセル済みイベントは変更不可
    if (event.canceled_at) {
      return false;
    }

    // 登録締切が設定されている場合、締切を過ぎていれば変更不可
    if (event.registration_deadline) {
      const deadline = new Date(event.registration_deadline);
      if (now > deadline) {
        return false;
      }
    }

    // イベント開始時刻を過ぎていれば変更不可
    const eventDate = new Date(event.date);
    if (now > eventDate) {
      return false;
    }

    return true;
  }

  /**
   * 安全な監査ログ記録
   * 監査ログの失敗がビジネスロジックを妨げないようにエラーをキャッチ
   */
  private async safeLogGuestAccess(
    token: string,
    action: "guest.access" | "guest.validate" | "guest.update" | "guest.read",
    success: boolean,
    additionalInfo?: {
      attendanceId?: string;
      eventId?: string;
      tableName?: string;
      operationType?: "SELECT" | "INSERT" | "UPDATE" | "DELETE";
      resultCount?: number;
      errorCode?: string;
      errorMessage?: string;
    }
  ): Promise<void> {
    try {
      // 監査ログの記録
      await logToSystemLogs(
        {
          log_category: "security",
          action,
          actor_type: "guest",
          actor_identifier: `${token.substring(0, 8)}...`, // マスクされたトークン
          resource_type: additionalInfo?.tableName === "attendances" ? "attendance" : "event",
          resource_id: additionalInfo?.attendanceId || additionalInfo?.eventId,
          outcome: success ? "success" : "failure",
          message: success
            ? `Guest ${action} successful`
            : `Guest ${action} failed: ${additionalInfo?.errorCode || "unknown error"}`,
          error_code: additionalInfo?.errorCode,
          error_message: additionalInfo?.errorMessage,
          metadata: {
            token_prefix: token.substring(0, 8),
            attendance_id: additionalInfo?.attendanceId,
            event_id: additionalInfo?.eventId,
            operation_type: additionalInfo?.operationType,
            result_count: additionalInfo?.resultCount,
          },
        },
        {
          alsoLogToPino: true,
          throwOnError: false, // 失敗しても業務を継続
        }
      );
    } catch (error) {
      // ログ記録自体の失敗はフォールバックとしてシステムログに記録
      handleServerError("AUDIT_LOG_RECORDING_FAILED", {
        category: "security",
        action: "guest_audit_log_error",
        actorType: "system",
        additionalData: {
          error_message: String(error),
          token_prefix: token.substring(0, 8),
          action_name: action,
        },
      });
    }
  }
}
