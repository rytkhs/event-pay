/**
 * EventPay セキュアSupabaseクライアントファクトリー実装
 *
 * 最小権限原則に基づいて設計されたSupabaseクライアントファクトリー
 * 管理者権限の使用を監査し、ゲストトークンによる透過的なアクセス制御を提供
 */

import { createClient } from "@supabase/supabase-js";
import { createServerClient, createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CookieOptions } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

import { validateGuestTokenFormat } from "./crypto";
import { logger } from "@/lib/logging/app-logger";

import {
  ISecureSupabaseClientFactory,
  IGuestTokenValidator,
  ISecurityAuditor,
} from "./secure-client-factory.interface";
import {
  AdminReason,
  GuestErrorCode,
  GuestTokenError,
  AdminAccessError,
  AdminAccessErrorCode,
  AuditContext,
  ClientCreationOptions,
  GuestValidationResult,
  GuestSession,
  GuestPermission,
  EventInfo,
} from "./secure-client-factory.types";
import { SecurityAuditorImpl } from "./security-auditor.impl";
import { isValidEventInfo } from "./type-guards";
import { COOKIE_CONFIG, AUTH_CONFIG, getCookieConfig } from "@/config/security";
import { isValidIsoDateTimeString } from "@/lib/utils/timezone";

/**
 * セキュアSupabaseクライアントファクトリーの実装
 */
export class SecureSupabaseClientFactory implements ISecureSupabaseClientFactory {
  private static instance: SecureSupabaseClientFactory;
  private readonly supabaseUrl: string;
  private readonly anonKey: string;
  private readonly serviceRoleKey: string;
  private readonly auditor: ISecurityAuditor;

  constructor() {
    this.supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    this.anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    this.serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!this.supabaseUrl || !this.anonKey || !this.serviceRoleKey) {
      throw new Error("Supabase environment variables are not configured");
    }

    this.auditor = new SecurityAuditorImpl();
  }

  /**
   * シングルトンインスタンスを取得
   */
  public static getInstance(): SecureSupabaseClientFactory {
    if (!SecureSupabaseClientFactory.instance) {
      SecureSupabaseClientFactory.instance = new SecureSupabaseClientFactory();
    }
    return SecureSupabaseClientFactory.instance;
  }

  /**
   * 新しいインスタンスを作成（テスト用）
   */
  public static create(): SecureSupabaseClientFactory {
    return new SecureSupabaseClientFactory();
  }

  /**
   * 通常の認証済みクライアントを作成
   */
  createAuthenticatedClient(options?: ClientCreationOptions): SupabaseClient {
    const cookieStore = cookies();

    return createServerClient(this.supabaseUrl, this.anonKey, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, cookieOptions: CookieOptions) {
          cookieStore.set(name, value, {
            ...cookieOptions,
            ...COOKIE_CONFIG,
            maxAge:
              name === AUTH_CONFIG.cookieNames.session
                ? AUTH_CONFIG.session.maxAge
                : cookieOptions.maxAge != null
                  ? cookieOptions.maxAge
                  : undefined,
          });
        },
        remove(name: string) {
          cookieStore.delete(name);
        },
      },
      auth: {
        persistSession: options?.persistSession ?? true,
        autoRefreshToken: options?.autoRefreshToken ?? true,
      },
      global: {
        headers: options?.headers || {},
      },
    });
  }

  /**
   * ゲストトークン認証クライアントを作成
   * X-Guest-Tokenヘッダーを自動設定し、RLSポリシーベースのアクセス制御を実現
   * SSR環境でも安全に動作するよう環境を考慮
   */
  createGuestClient(token: string, options?: ClientCreationOptions): SupabaseClient {
    // トークンの基本フォーマット検証
    if (!validateGuestTokenFormat(token)) {
      throw new GuestTokenError(
        GuestErrorCode.INVALID_FORMAT,
        "Invalid guest token format. Token must be 36 characters long with gst_ prefix.",
        { tokenLength: token.length }
      );
    }

    // SSR環境（サーバーサイド）かどうかを判定
    const isServerSide = typeof window === "undefined";

    if (isServerSide) {
      // サーバーサイドでは createServerClient を使用（ただしcookiesは不要）
      return createServerClient(this.supabaseUrl, this.anonKey, {
        cookies: {
          get: () => undefined,
          set: () => { },
          remove: () => { },
        },
        auth: {
          persistSession: false, // ゲストセッションは永続化しない
          autoRefreshToken: false,
        },
        global: {
          headers: {
            "X-Guest-Token": token, // カスタムヘッダーでトークンを自動設定
            ...options?.headers,
          },
        },
      });
    } else {
      // クライアントサイドでは createClient を使用
      return createClient(this.supabaseUrl, this.anonKey, {
        auth: {
          persistSession: options?.persistSession ?? false, // ゲストセッションは永続化しない
          autoRefreshToken: options?.autoRefreshToken ?? false,
        },
        global: {
          headers: {
            "X-Guest-Token": token, // カスタムヘッダーでトークンを自動設定
            ...options?.headers,
          },
        },
      });
    }
  }

  /**
   * 監査付き管理者クライアントを作成
   * 管理者権限の使用を記録し、適切な理由と共に監査ログに記録
   */
  async createAuditedAdminClient(
    reason: AdminReason,
    context: string,
    auditContext?: AuditContext,
    options?: ClientCreationOptions
  ): Promise<SupabaseClient> {
    // 理由の妥当性をチェック
    if (!Object.values(AdminReason).includes(reason)) {
      throw new AdminAccessError(
        AdminAccessErrorCode.UNAUTHORIZED_REASON,
        `Invalid admin reason: ${reason}`,
        auditContext
      );
    }

    // コンテキストが提供されているかチェック
    if (!context || context.trim().length === 0) {
      throw new AdminAccessError(
        AdminAccessErrorCode.MISSING_CONTEXT,
        "Admin access context is required",
        auditContext
      );
    }

    // 監査ログを記録
    try {
      const fullAuditContext: AuditContext = {
        userId: auditContext?.userId,
        ipAddress: auditContext?.ipAddress,
        userAgent: auditContext?.userAgent,
        accessedTables: auditContext?.accessedTables,
        operationType: auditContext?.operationType,
        additionalInfo: {
          reason,
          context,
          timestamp: new Date().toISOString(),
          ...auditContext?.additionalInfo,
        },
      };

      await this.auditor.logAdminAccess(reason, context, fullAuditContext);
    } catch (error) {
      throw new AdminAccessError(
        AdminAccessErrorCode.AUDIT_LOG_FAILED,
        `Failed to log admin access: ${error}`,
        auditContext
      );
    }

    // 管理者クライアントを作成
    return createClient(this.supabaseUrl, this.serviceRoleKey, {
      auth: {
        autoRefreshToken: options?.autoRefreshToken ?? false,
        persistSession: options?.persistSession ?? false,
      },
      global: {
        headers: {
          "X-Admin-Reason": reason,
          "X-Admin-Context": context,
          "X-Admin-User-Id": auditContext?.userId || "system",
          ...options?.headers,
        },
      },
    });
  }

  /**
   * 読み取り専用クライアントを作成
   */
  createReadOnlyClient(options?: ClientCreationOptions): SupabaseClient {
    return createClient(this.supabaseUrl, this.anonKey, {
      auth: {
        persistSession: options?.persistSession ?? false,
        autoRefreshToken: options?.autoRefreshToken ?? false,
      },
      global: {
        headers: {
          "X-Read-Only": "true",
          ...options?.headers,
        },
      },
    });
  }

  /**
   * ミドルウェア用クライアントを作成
   */
  createMiddlewareClient(
    request: NextRequest,
    response: NextResponse,
    options?: ClientCreationOptions
  ): SupabaseClient {
    // HTTPS接続を動的に検出
    const isHttps =
      request.url.startsWith("https://") || request.headers.get("x-forwarded-proto") === "https";

    const cookieConfig = getCookieConfig(isHttps);

    return createServerClient(this.supabaseUrl, this.anonKey, {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, cookieOptions: CookieOptions) {
          response.cookies.set(name, value, {
            ...cookieOptions,
            ...cookieConfig,
          });
        },
        remove(name: string, cookieOptions: CookieOptions) {
          response.cookies.delete({ name, ...cookieOptions });
        },
      },
      auth: {
        persistSession: options?.persistSession ?? true,
        autoRefreshToken: options?.autoRefreshToken ?? true,
      },
      global: {
        headers: {
          "X-Middleware-Client": "true",
          ...options?.headers,
        },
      },
    });
  }

  /**
   * ブラウザ用クライアントを作成
   */
  createBrowserClient(options?: ClientCreationOptions): SupabaseClient {
    return createBrowserClient(this.supabaseUrl, this.anonKey, {
      auth: {
        persistSession: options?.persistSession ?? true,
        autoRefreshToken: options?.autoRefreshToken ?? true,
      },
      global: {
        headers: {
          "X-Browser-Client": "true",
          ...options?.headers,
        },
      },
    });
  }
}

/**
 * RLSポリシーベースのゲストトークンバリデーター実装
 */
export class RLSBasedGuestValidator implements IGuestTokenValidator {
  private readonly clientFactory: SecureSupabaseClientFactory;
  private readonly auditor: ISecurityAuditor;

  constructor() {
    this.clientFactory = SecureSupabaseClientFactory.getInstance();
    this.auditor = new SecurityAuditorImpl();
  }

  /**
   * ゲストトークンを検証
   * RLSポリシーを使用してトークンの有効性を確認
   */
  async validateToken(token: string): Promise<GuestValidationResult> {
    // 基本フォーマット検証
    if (!validateGuestTokenFormat(token)) {
      // 監査ログの失敗はビジネスロジックを妨げない
      await this.safeLogGuestAccess(token, "VALIDATE_TOKEN", false, {
        errorCode: GuestErrorCode.INVALID_FORMAT,
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
        // 監査ログの失敗はビジネスロジックを妨げない
        await this.safeLogGuestAccess(token, "VALIDATE_TOKEN", false, {
          errorCode: GuestErrorCode.TOKEN_NOT_FOUND,
          errorMessage: error?.message,
        });

        return {
          isValid: false,
          errorCode: GuestErrorCode.TOKEN_NOT_FOUND,
          canModify: false,
        };
      }

      // 変更可能性をチェック
      const canModify = this.checkCanModify(attendance.event);

      // 成功をログに記録（監査ログの失敗はビジネスロジックを妨げない）
      await this.safeLogGuestAccess(token, "VALIDATE_TOKEN", true, {
        attendanceId: attendance.id,
        eventId: attendance.event_id,
        resultCount: 1,
      });

      return {
        isValid: true,
        attendanceId: attendance.id,
        eventId: attendance.event_id,
        canModify,
      };
    } catch (error) {
      // RLSポリシー違反やその他のエラー
      // 監査ログの失敗はビジネスロジックを妨げない
      await this.safeLogGuestAccess(token, "VALIDATE_TOKEN", false, {
        errorCode: GuestErrorCode.TOKEN_NOT_FOUND,
        errorMessage: String(error),
      });

      return {
        isValid: false,
        errorCode: GuestErrorCode.TOKEN_NOT_FOUND,
        canModify: false,
      };
    }
  }

  /**
   * ゲストセッションを作成
   */
  async createGuestSession(token: string): Promise<GuestSession> {
    const validationResult = await this.validateToken(token);

    if (!validationResult.isValid || !validationResult.attendanceId || !validationResult.eventId) {
      throw new GuestTokenError(
        validationResult.errorCode || GuestErrorCode.TOKEN_NOT_FOUND,
        "Cannot create session for invalid token"
      );
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
   */
  async checkModificationPermissions(token: string): Promise<boolean> {
    const validationResult = await this.validateToken(token);
    return validationResult.canModify;
  }

  /**
   * トークンの基本フォーマットを検証
   */
  validateTokenFormat(token: string): boolean {
    return validateGuestTokenFormat(token);
  }

  /**
   * イベント情報の型ガード（型ガードファイルの関数を使用）
   */
  private isValidEventInfo(event: unknown): event is EventInfo {
    return isValidEventInfo(event);
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
    if (!isValidEventInfo(event)) {
      logger.warn("Invalid event info provided to checkCanModify", {
        tag: "invalidEventInfo",
        event_id: typeof event === 'object' && event && 'id' in event ? String(event.id) : 'unknown'
      });
      return false; // 無効なイベント情報の場合は変更不可
    }

    // 日付の妥当性をチェック
    if (!this.isValidDateString(event.date)) {
      logger.warn("Invalid event date format", {
        tag: "invalidDateFormat",
        event_id: event.id,
        event_date: event.date
      });
      return false;
    }

    const now = new Date();
    const eventDate = new Date(event.date);

    // 登録締切の処理
    let registrationDeadline: Date | null = null;
    if (event.registration_deadline) {
      if (!this.isValidDateString(event.registration_deadline)) {
        logger.warn("Invalid registration deadline format", {
          tag: "invalidDeadlineFormat",
          event_id: event.id,
          registration_deadline: event.registration_deadline
        });
        return false;
      }
      registrationDeadline = new Date(event.registration_deadline);
    }

    // イベント開始前かつ登録締切前かつ開催予定（upcoming）状態
    const isBeforeEventStart = eventDate > now;
    const isBeforeDeadline = registrationDeadline === null || registrationDeadline > now;
    const isUpcoming = event.status === "upcoming";

    return isBeforeEventStart && isBeforeDeadline && isUpcoming;
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
 * セキュアクライアントファクトリーのシングルトンインスタンスを取得
 */
export function getSecureClientFactory(): SecureSupabaseClientFactory {
  return SecureSupabaseClientFactory.getInstance();
}

/**
 * セキュアクライアントファクトリーの新しいインスタンスを作成
 * テスト環境や特別な用途で使用
 */
export function createSecureClientFactory(): SecureSupabaseClientFactory {
  return SecureSupabaseClientFactory.create();
}

/**
 * ゲストトークンバリデーターのインスタンスを取得
 */
export function getGuestTokenValidator(): IGuestTokenValidator {
  return new RLSBasedGuestValidator();
}
