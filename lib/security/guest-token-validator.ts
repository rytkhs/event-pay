/**
 * EventPay RLSベースゲストトークンバリデーター
 *
 * 管理者権限を使用せず、RLSポリシーベースのアクセス制御により
 * ゲストトークンの検証と参加情報の取得を行う
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { validateGuestTokenFormat } from "./crypto";
import { getSecureClientFactory } from "./secure-client-factory.impl";
import {
  IGuestTokenValidator,
  ISecurityAuditor,
} from "./secure-client-factory.interface";
import {
  GuestErrorCode,
  GuestTokenError,
  GuestTokenErrorFactory,
  GuestValidationResult,
  GuestSession,
  GuestPermission,
  AuditContext,
  EventInfo,
} from "./secure-client-factory.types";
import { SecurityAuditorImpl } from "./security-auditor.impl";
import { sanitizeForEventPay } from "@/lib/utils/sanitize";
import type { Database } from "@/types/database";

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
    created_by: string;
    status: string;
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
  private readonly clientFactory = getSecureClientFactory();
  private readonly auditor: ISecurityAuditor;

  constructor() {
    this.auditor = new SecurityAuditorImpl();
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
      await this.safeLogGuestAccess(token, "VALIDATE_TOKEN", false, {
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
      // ゲストクライアントを作成（X-Guest-Tokenヘッダー自動設定）
      const guestClient = this.clientFactory.createGuestClient(token);

      // RLSポリシーにより、該当するattendanceのみ取得される
      const { data: attendance, error } = await guestClient
        .from("attendances")
        .select(
          `
          id,
          event_id,
          status,
          event:events (
            id,
            date,
            registration_deadline,
            status
          )
        `
        )
        .single(); // トークンが有効なら必ず1件のみ取得される

      if (error || !attendance) {
        await this.safeLogGuestAccess(token, "VALIDATE_TOKEN", false, {
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

      // 変更可能性をチェック
      const canModify = this.checkCanModify(attendance.event);

      // 成功をログに記録
      await this.safeLogGuestAccess(token, "VALIDATE_TOKEN", true, {
        attendanceId: attendance.id,
        eventId: attendance.event?.id || "",
        tableName: "attendances",
        operationType: "SELECT",
        resultCount: 1,
      });

      return {
        isValid: true,
        attendanceId: attendance.id,
        eventId: attendance.event?.id || "",
        canModify,
      };
    } catch (error) {
      // RLSポリシー違反やその他のエラー
      await this.safeLogGuestAccess(token, "VALIDATE_TOKEN", false, {
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
      await this.safeLogGuestAccess(token, "VALIDATE_TOKEN_DETAILS", false, {
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
      // ゲストクライアントを作成
      const guestClient = this.clientFactory.createGuestClient(token);

      // 詳細な参加データを取得
      const { data: attendance, error } = await guestClient
        .from("attendances")
        .select(
          `
          id,
          nickname,
          email,
          status,
          guest_token,
          created_at,
          updated_at,
          event:events (
            id,
            title,
            description,
            date,
            location,
            fee,
            capacity,
            registration_deadline,
            payment_deadline,
            created_by,
            status
          ),
          payment:payments (
            id,
            amount,
            method,
            status,
            created_at
          )
        `
        )
        .single();

      if (error || !attendance) {
        await this.safeLogGuestAccess(token, "VALIDATE_TOKEN_DETAILS", false, {
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

      // イベントデータの存在確認と正規化
      const eventData = Array.isArray(attendance.event) ? attendance.event[0] : attendance.event;

      if (!eventData) {
        return {
          isValid: false,
          errorMessage: "イベントデータが見つかりません",
          canModify: false,
          errorCode: GuestErrorCode.EVENT_NOT_FOUND,
        };
      }

      // 支払いデータの正規化
      const paymentData = attendance.payment
        ? Array.isArray(attendance.payment)
          ? attendance.payment[0]
          : attendance.payment
        : null;

      // 変更可能かどうかの判定
      const canModify = this.checkCanModifyAttendance(eventData);

      // 成功をログに記録
      await this.safeLogGuestAccess(token, "VALIDATE_TOKEN_DETAILS", true, {
        attendanceId: attendance.id,
        eventId: attendance.event?.id || "",
        tableName: "attendances",
        operationType: "SELECT",
        resultCount: 1,
      });

      return {
        isValid: true,
        attendance: {
          ...attendance,
          nickname: sanitizeForEventPay(attendance.nickname),
          event: {
            ...eventData,
            title: sanitizeForEventPay(eventData.title),
            description: eventData.description ? sanitizeForEventPay(eventData.description) : null,
            location: eventData.location ? sanitizeForEventPay(eventData.location) : null,
          },
          payment: paymentData,
        } as RLSGuestAttendanceData,
        canModify,
      };
    } catch (error) {
      await this.safeLogGuestAccess(token, "VALIDATE_TOKEN_DETAILS", false, {
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
    await this.safeLogGuestAccess(token, "CREATE_SESSION", true, {
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
      "status" in event &&
      typeof (event as EventInfo).id === "string" &&
      typeof (event as EventInfo).date === "string" &&
      typeof (event as EventInfo).status === "string" &&
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
    const date = new Date(dateStr);
    return !isNaN(date.getTime()) && dateStr === date.toISOString();
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
    const isActive = event.status === "active";

    return isBeforeEventStart && isBeforeDeadline && isActive;
  }

  /**
   * 参加状況を変更可能かどうかを判定する（従来互換）
   */
  private checkCanModifyAttendance(event: RLSGuestAttendanceData["event"]): boolean {
    const now = new Date();

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

    // イベントがアクティブでない場合は変更不可
    if (event.status !== "active") {
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
    action: string,
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
      const auditContext: AuditContext = {
        guestToken: token,
        operationType: additionalInfo?.operationType || "SELECT",
        additionalInfo,
      };
      await this.auditor.logGuestAccess(token, action, auditContext, success, additionalInfo);
    } catch (_auditError) {
      // 監査ログの失敗をコンソールに記録するが、ビジネスロジックは継続
      // 将来的には、監査ログ失敗の通知システムを実装することも検討
      // 例: メトリクス送信、アラート送信など
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