/**
 * EventPay RLSベースゲストトークンバリデーター
 *
 * 管理者権限を使用せず、RLSポリシーベースのアクセス制御により
 * ゲストトークンの検証と参加情報の取得を行う
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@core/logging/app-logger";
import { logToSystemLogs } from "@core/logging/system-logger";
import { sanitizeForEventPay } from "@core/utils/sanitize";
import { isValidIsoDateTimeString } from "@core/utils/timezone";

import type { Database } from "@/types/database";

import { validateGuestTokenFormat } from "./crypto";
import { SecureSupabaseClientFactory } from "./secure-client-factory.impl";
import { IGuestTokenValidator } from "./secure-client-factory.interface";
import {
  GuestErrorCode,
  GuestTokenErrorFactory,
  GuestValidationResult,
  GuestSession,
  GuestPermission,
  EventInfo,
} from "./secure-client-factory.types";

/**
 * ゲスト参加データの型定義（RLSベース）
 */
export interface RLSGuestAttendanceData {
  id: string;
  nickname: string;
  email: string;
  status: Database["public"]["Enums"]["attendance_status_enum"];
  guest_token: string;
  created_at: string;
  updated_at: string;
  event: {
    id: string;
    title: string;
    description: string | null;
    date: string;
    location: string | null;
    fee: number;
    capacity: number | null;
    registration_deadline: string | null;
    payment_deadline: string | null;
    payment_methods: Database["public"]["Enums"]["payment_method_enum"][];
    allow_payment_after_deadline?: boolean;
    grace_period_days?: number | null;
    created_by: string;
    canceled_at?: string | null;
  };
  payment?: {
    id: string;
    amount: number;
    method: Database["public"]["Enums"]["payment_method_enum"];
    status: Database["public"]["Enums"]["payment_status_enum"];
    created_at: string;
  } | null;
}

/**
 * RLSベースゲストトークン検証結果
 */
export interface RLSGuestTokenValidationResult {
  isValid: boolean;
  attendance?: RLSGuestAttendanceData;
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
  private readonly clientFactory = SecureSupabaseClientFactory.create();
  // Security auditor removed

  constructor() {
    // Security auditor removed
  }

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
      const guestClient = this.clientFactory.createGuestClient(token);

      // 公開RPCに置換（最小列）
      const { data: rpcRow, error } = await (guestClient as any)
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
      const eventData = {
        id: (rpcRow as any).event_id,
        date: (rpcRow as any).event_date,
        registration_deadline: (rpcRow as any).registration_deadline,
        payment_deadline: (rpcRow as any).payment_deadline,
        payment_methods: (rpcRow as any).event_payment_methods || [],
        canceled_at: (rpcRow as any).canceled_at,
      } as any;
      const canModify = this.checkCanModify(eventData);

      // 成功をログに記録
      await this.safeLogGuestAccess(token, "guest.validate", true, {
        attendanceId: (rpcRow as any).attendance_id,
        eventId: eventData ? (eventData as any).id : "",
        tableName: "attendances",
        operationType: "SELECT",
        resultCount: 1,
      });

      return {
        isValid: true,
        attendanceId: (rpcRow as any).attendance_id,
        eventId: eventData ? (eventData as any).id : "",
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
      const guestClient = this.clientFactory.createGuestClient(token);

      // 詳細な参加データを取得（最新支払い1件を含む）
      const { data: rpcRow, error } = await (guestClient as any)
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

      const eventData = {
        id: (rpcRow as any).event_id,
        title: (rpcRow as any).event_title,
        date: (rpcRow as any).event_date,
        location: (rpcRow as any).event_location,
        fee: (rpcRow as any).event_fee,
        capacity: (rpcRow as any).event_capacity,
        description: (rpcRow as any).event_description,
        payment_methods: (rpcRow as any).event_payment_methods,
        allow_payment_after_deadline: (rpcRow as any).event_allow_payment_after_deadline,
        grace_period_days: (rpcRow as any).event_grace_period_days,
        registration_deadline: (rpcRow as any).registration_deadline,
        payment_deadline: (rpcRow as any).payment_deadline,
        created_by: (rpcRow as any).created_by,
        canceled_at: (rpcRow as any).canceled_at,
      } as any;

      const canModify = this.checkCanModifyAttendance(eventData);

      // 成功をログに記録
      await this.safeLogGuestAccess(token, "guest.read", true, {
        attendanceId: (rpcRow as any).attendance_id,
        eventId: eventData ? eventData.id : "",
        tableName: "attendances",
        operationType: "SELECT",
        resultCount: 1,
      });

      // 支払い情報を整形（存在する場合のみ）
      const payment = (rpcRow as any).payment_id
        ? {
            id: (rpcRow as any).payment_id as string,
            amount: Number((rpcRow as any).payment_amount),
            method: (rpcRow as any).payment_method,
            status: (rpcRow as any).payment_status,
            created_at: (rpcRow as any).payment_created_at,
          }
        : null;

      return {
        isValid: true,
        attendance: {
          id: (rpcRow as any).attendance_id,
          nickname: (rpcRow as any).nickname,
          email: (rpcRow as any).email,
          status: (rpcRow as any).status,
          guest_token: (rpcRow as any).guest_token,
          created_at: (rpcRow as any).attendance_created_at,
          updated_at: (rpcRow as any).attendance_updated_at,
          event: {
            ...eventData,
            title: sanitizeForEventPay((rpcRow as any).event_title),
          },
          payment,
        } as RLSGuestAttendanceData,
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
   * イベント情報の型ガード
   */
  private isValidEventInfo(event: unknown): event is EventInfo {
    return (
      typeof event === "object" &&
      event !== null &&
      "id" in event &&
      "date" in event &&
      typeof (event as EventInfo).id === "string" &&
      typeof (event as EventInfo).date === "string" &&
      ("canceled_at" in (event as any)
        ? (event as any).canceled_at === null || typeof (event as any).canceled_at === "string"
        : true) &&
      // registration_deadlineはオプショナル
      ("registration_deadline" in event
        ? (event as EventInfo).registration_deadline === null ||
          typeof (event as EventInfo).registration_deadline === "string"
        : true)
    );
  }

  /**
   * 日付文字列の有効性をチェック
   */
  private isValidDateString(dateStr: string): boolean {
    return isValidIsoDateTimeString(dateStr);
  }

  /**
   * イベント情報から変更可能性を判定
   */
  private checkCanModify(event: unknown): boolean {
    // 型ガードでイベント情報の妥当性をチェック
    if (!this.isValidEventInfo(event)) {
      return false; // 無効なイベント情報の場合は変更不可
    }

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
    const notCanceled = !(event as any).canceled_at;

    return isBeforeEventStart && isBeforeDeadline && notCanceled;
  }

  /**
   * 参加状況を変更可能かどうかを判定する（従来互換）
   */
  private checkCanModifyAttendance(event: RLSGuestAttendanceData["event"]): boolean {
    const now = new Date();

    // キャンセル済みイベントは変更不可
    if ((event as any).canceled_at) {
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
      logger.error("Critical fail: guest audit log recording failed", {
        error: String(error),
        token_prefix: token.substring(0, 8),
        action,
      });
    }
  }
}

/**
 * RLSベースゲストトークンバリデーターのシングルトンインスタンスを取得
 */
export function getRLSGuestTokenValidator(): IGuestTokenValidator {
  return new RLSGuestTokenValidator();
}

/**
 * 従来のvalidateGuestToken関数の互換実装
 * 既存コードとの互換性を保つためのラッパー関数
 *
 * @param guestToken ゲストトークン
 * @returns 検証結果と参加データ
 */
export async function validateGuestTokenRLS(
  guestToken: string
): Promise<RLSGuestTokenValidationResult> {
  const validator = getRLSGuestTokenValidator() as RLSGuestTokenValidator;
  return validator.validateGuestTokenWithDetails(guestToken);
}
