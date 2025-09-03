/**
 * EventPay ゲストトークンエラーハンドリング
 *
 * ゲストトークン検証とアクセス制御に関する
 * エラーコード、エラークラス、エラーメッセージの定義
 */

/**
 * ゲストトークンエラーコード
 *
 * 各エラーコードは特定のエラー状況を表し、
 * 適切なユーザーメッセージとログ記録を可能にします。
 */
export enum GuestErrorCode {
  // フォーマットエラー
  INVALID_FORMAT = "INVALID_FORMAT",
  MISSING_TOKEN = "MISSING_TOKEN",

  // 認証エラー
  TOKEN_NOT_FOUND = "TOKEN_NOT_FOUND",
  TOKEN_EXPIRED = "TOKEN_EXPIRED",
  TOKEN_REVOKED = "TOKEN_REVOKED",

  // 権限エラー
  MODIFICATION_NOT_ALLOWED = "MODIFICATION_NOT_ALLOWED",
  READ_ONLY_ACCESS = "READ_ONLY_ACCESS",
  INSUFFICIENT_PERMISSIONS = "INSUFFICIENT_PERMISSIONS",

  // リソースエラー
  EVENT_NOT_FOUND = "EVENT_NOT_FOUND",
  ATTENDANCE_NOT_FOUND = "ATTENDANCE_NOT_FOUND",
  PAYMENT_NOT_FOUND = "PAYMENT_NOT_FOUND",

  // 制限エラー
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
  CONCURRENT_ACCESS_LIMIT = "CONCURRENT_ACCESS_LIMIT",

  // システムエラー
  DATABASE_ERROR = "DATABASE_ERROR",
  RLS_POLICY_VIOLATION = "RLS_POLICY_VIOLATION",
  NETWORK_ERROR = "NETWORK_ERROR",
  INTERNAL_ERROR = "INTERNAL_ERROR",
}

/**
 * エラーの重要度レベル
 */
export enum ErrorSeverity {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL",
}

/**
 * エラーコンテキスト情報
 */
interface GuestErrorContext {
  // トークン情報（ハッシュ化済み）
  tokenHash?: string;
  tokenLength?: number;

  // リクエスト情報
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp?: Date;

  // リソース情報
  attendanceId?: string;
  eventId?: string;
  tableName?: string;
  operation?: string;

  // パフォーマンス情報
  responseTime?: number;
  retryCount?: number;

  // 追加情報
  additionalInfo?: Record<string, unknown>;
}

/**
 * ゲストトークンエラークラス
 *
 * 構造化されたエラー情報を提供し、
 * 適切なログ記録と監査を可能にします。
 */
export class GuestTokenError extends Error {
  public readonly code: GuestErrorCode;
  public readonly severity: ErrorSeverity;
  public readonly context: GuestErrorContext;
  public readonly timestamp: Date;
  public readonly isRetryable: boolean;
  public readonly userMessage: string;

  constructor(
    code: GuestErrorCode,
    message: string,
    context: GuestErrorContext = {},
    severity?: ErrorSeverity
  ) {
    super(message);

    this.name = "GuestTokenError";
    this.code = code;
    this.context = context;
    this.timestamp = new Date();
    this.severity = severity || this.determineSeverity(code);
    this.isRetryable = this.determineRetryability(code);
    this.userMessage = this.generateUserMessage(code, context);

    // スタックトレースを適切に設定
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GuestTokenError);
    }
  }

  /**
   * エラーの詳細情報を取得
   */
  getDetails(): {
    code: GuestErrorCode;
    message: string;
    userMessage: string;
    severity: ErrorSeverity;
    isRetryable: boolean;
    context: GuestErrorContext;
    timestamp: Date;
  } {
    return {
      code: this.code,
      message: this.message,
      userMessage: this.userMessage,
      severity: this.severity,
      isRetryable: this.isRetryable,
      context: this.context,
      timestamp: this.timestamp,
    };
  }

  /**
   * ログ記録用の構造化データを取得
   */
  toLogData(): Record<string, unknown> {
    return {
      errorType: "GuestTokenError",
      code: this.code,
      message: this.message,
      severity: this.severity,
      isRetryable: this.isRetryable,
      timestamp: this.timestamp.toISOString(),
      context: {
        ...this.context,
        // セキュリティ上の理由でトークン自体は記録しない
        tokenHash: this.context.tokenHash,
      },
      stack: this.stack,
    };
  }

  /**
   * ユーザー向けのエラーレスポンスを生成
   */
  toUserResponse(): {
    error: true;
    code: string;
    message: string;
    canRetry: boolean;
    timestamp: string;
  } {
    return {
      error: true,
      code: this.code,
      message: this.userMessage,
      canRetry: this.isRetryable,
      timestamp: this.timestamp.toISOString(),
    };
  }

  /**
   * エラーコードから重要度を決定
   */
  private determineSeverity(code: GuestErrorCode): ErrorSeverity {
    switch (code) {
      case GuestErrorCode.INVALID_FORMAT:
      case GuestErrorCode.MISSING_TOKEN:
        return ErrorSeverity.LOW;

      case GuestErrorCode.TOKEN_NOT_FOUND:
      case GuestErrorCode.TOKEN_EXPIRED:
      case GuestErrorCode.MODIFICATION_NOT_ALLOWED:
      case GuestErrorCode.EVENT_NOT_FOUND:
      case GuestErrorCode.ATTENDANCE_NOT_FOUND:
        return ErrorSeverity.MEDIUM;

      case GuestErrorCode.TOKEN_REVOKED:
      case GuestErrorCode.INSUFFICIENT_PERMISSIONS:
      case GuestErrorCode.RATE_LIMIT_EXCEEDED:
      case GuestErrorCode.RLS_POLICY_VIOLATION:
        return ErrorSeverity.HIGH;

      case GuestErrorCode.DATABASE_ERROR:
      case GuestErrorCode.INTERNAL_ERROR:
        return ErrorSeverity.CRITICAL;

      default:
        return ErrorSeverity.MEDIUM;
    }
  }

  /**
   * エラーコードから再試行可能性を決定
   */
  private determineRetryability(code: GuestErrorCode): boolean {
    switch (code) {
      // 再試行可能なエラー
      case GuestErrorCode.NETWORK_ERROR:
      case GuestErrorCode.DATABASE_ERROR:
      case GuestErrorCode.INTERNAL_ERROR:
        return true;

      // 再試行不可能なエラー
      case GuestErrorCode.INVALID_FORMAT:
      case GuestErrorCode.MISSING_TOKEN:
      case GuestErrorCode.TOKEN_NOT_FOUND:
      case GuestErrorCode.TOKEN_EXPIRED:
      case GuestErrorCode.TOKEN_REVOKED:
      case GuestErrorCode.MODIFICATION_NOT_ALLOWED:
      case GuestErrorCode.INSUFFICIENT_PERMISSIONS:
      case GuestErrorCode.EVENT_NOT_FOUND:
      case GuestErrorCode.ATTENDANCE_NOT_FOUND:
      case GuestErrorCode.RLS_POLICY_VIOLATION:
        return false;

      // 条件付き再試行可能
      case GuestErrorCode.RATE_LIMIT_EXCEEDED:
      case GuestErrorCode.CONCURRENT_ACCESS_LIMIT:
        return true; // 時間をおいて再試行可能

      default:
        return false;
    }
  }

  /**
   * ユーザー向けメッセージを生成
   */
  private generateUserMessage(code: GuestErrorCode, _context: GuestErrorContext): string {
    switch (code) {
      case GuestErrorCode.INVALID_FORMAT:
        return "無効なゲストトークンの形式です。正しいリンクからアクセスしてください。";

      case GuestErrorCode.MISSING_TOKEN:
        return "ゲストトークンが指定されていません。正しいリンクからアクセスしてください。";

      case GuestErrorCode.TOKEN_NOT_FOUND:
        return "参加情報が見つかりません。リンクが正しいか確認してください。";

      case GuestErrorCode.TOKEN_EXPIRED:
        return "このリンクは期限切れです。イベント主催者にお問い合わせください。";

      case GuestErrorCode.TOKEN_REVOKED:
        return "このリンクは無効になっています。イベント主催者にお問い合わせください。";

      case GuestErrorCode.MODIFICATION_NOT_ALLOWED:
        return "参加情報の変更期限を過ぎています。変更が必要な場合は主催者にお問い合わせください。";

      case GuestErrorCode.READ_ONLY_ACCESS:
        return "現在は参加情報の閲覧のみ可能です。";

      case GuestErrorCode.INSUFFICIENT_PERMISSIONS:
        return "この操作を実行する権限がありません。";

      case GuestErrorCode.EVENT_NOT_FOUND:
        return "イベント情報が見つかりません。";

      case GuestErrorCode.ATTENDANCE_NOT_FOUND:
        return "参加情報が見つかりません。";

      case GuestErrorCode.PAYMENT_NOT_FOUND:
        return "支払い情報が見つかりません。";

      case GuestErrorCode.RATE_LIMIT_EXCEEDED:
        return "アクセス頻度が高すぎます。しばらく時間をおいてから再度お試しください。";

      case GuestErrorCode.CONCURRENT_ACCESS_LIMIT:
        return "同時アクセス数の上限に達しています。しばらく時間をおいてから再度お試しください。";

      case GuestErrorCode.DATABASE_ERROR:
        return "データベースエラーが発生しました。しばらく時間をおいてから再度お試しください。";

      case GuestErrorCode.RLS_POLICY_VIOLATION:
        return "セキュリティポリシー違反が検出されました。";

      case GuestErrorCode.NETWORK_ERROR:
        return "ネットワークエラーが発生しました。接続を確認して再度お試しください。";

      case GuestErrorCode.INTERNAL_ERROR:
        return "内部エラーが発生しました。しばらく時間をおいてから再度お試しください。";

      default:
        return "エラーが発生しました。しばらく時間をおいてから再度お試しください。";
    }
  }
}

/**
 * エラーファクトリー関数
 *
 * 一般的なエラーパターンに対する便利な作成関数を提供
 */
export class GuestTokenErrorFactory {
  /**
   * 無効なフォーマットエラーを作成
   */
  static invalidFormat(tokenLength?: number): GuestTokenError {
    return new GuestTokenError(GuestErrorCode.INVALID_FORMAT, "Invalid guest token format", {
      tokenLength,
    });
  }

  /**
   * トークンが見つからないエラーを作成
   */
  static tokenNotFound(tokenHash?: string): GuestTokenError {
    return new GuestTokenError(GuestErrorCode.TOKEN_NOT_FOUND, "Guest token not found", {
      tokenHash,
    });
  }

  /**
   * 変更不可エラーを作成
   */
  static modificationNotAllowed(eventId?: string, reason?: string): GuestTokenError {
    return new GuestTokenError(
      GuestErrorCode.MODIFICATION_NOT_ALLOWED,
      "Modification not allowed",
      { eventId, additionalInfo: { reason } }
    );
  }

  /**
   * レート制限エラーを作成
   */
  static rateLimitExceeded(ipAddress?: string, retryAfter?: number): GuestTokenError {
    return new GuestTokenError(GuestErrorCode.RATE_LIMIT_EXCEEDED, "Rate limit exceeded", {
      ipAddress,
      additionalInfo: { retryAfter },
    });
  }

  /**
   * データベースエラーを作成
   */
  static databaseError(originalError: Error, operation?: string): GuestTokenError {
    return new GuestTokenError(
      GuestErrorCode.DATABASE_ERROR,
      `Database error: ${originalError.message}`,
      {
        operation,
        additionalInfo: {
          originalError: originalError.name,
          originalMessage: originalError.message,
        },
      }
    );
  }

  /**
   * RLSポリシー違反エラーを作成
   */
  static rlsPolicyViolation(tableName?: string, operation?: string): GuestTokenError {
    return new GuestTokenError(
      GuestErrorCode.RLS_POLICY_VIOLATION,
      "RLS policy violation detected",
      { tableName, operation },
      ErrorSeverity.HIGH
    );
  }
}

/**
 * エラーハンドリングユーティリティ
 */
export class GuestTokenErrorHandler {
  /**
   * エラーが再試行可能かどうかを判定
   */
  static isRetryable(error: unknown): boolean {
    if (error instanceof GuestTokenError) {
      return error.isRetryable;
    }
    return false;
  }

  /**
   * エラーの重要度を取得
   */
  static getSeverity(error: unknown): ErrorSeverity {
    if (error instanceof GuestTokenError) {
      return error.severity;
    }
    return ErrorSeverity.MEDIUM;
  }

  /**
   * エラーをログ記録用データに変換
   */
  static toLogData(error: unknown): Record<string, unknown> {
    if (error instanceof GuestTokenError) {
      return error.toLogData();
    }

    if (error instanceof Error) {
      return {
        errorType: error.name,
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      errorType: "UnknownError",
      message: String(error),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * エラーをユーザーレスポンスに変換
   */
  static toUserResponse(error: unknown): {
    error: true;
    code: string;
    message: string;
    canRetry: boolean;
    timestamp: string;
  } {
    if (error instanceof GuestTokenError) {
      return error.toUserResponse();
    }

    return {
      error: true,
      code: "UNKNOWN_ERROR",
      message: "予期しないエラーが発生しました。しばらく時間をおいてから再度お試しください。",
      canRetry: false,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * エラーから適切なHTTPステータスコードを決定
   */
  static getHttpStatusCode(error: unknown): number {
    if (!(error instanceof GuestTokenError)) {
      return 500; // Internal Server Error
    }

    switch (error.code) {
      case GuestErrorCode.INVALID_FORMAT:
      case GuestErrorCode.MISSING_TOKEN:
        return 400; // Bad Request

      case GuestErrorCode.TOKEN_NOT_FOUND:
      case GuestErrorCode.TOKEN_EXPIRED:
      case GuestErrorCode.TOKEN_REVOKED:
      case GuestErrorCode.INSUFFICIENT_PERMISSIONS:
        return 401; // Unauthorized

      case GuestErrorCode.MODIFICATION_NOT_ALLOWED:
      case GuestErrorCode.READ_ONLY_ACCESS:
        return 403; // Forbidden

      case GuestErrorCode.EVENT_NOT_FOUND:
      case GuestErrorCode.ATTENDANCE_NOT_FOUND:
      case GuestErrorCode.PAYMENT_NOT_FOUND:
        return 404; // Not Found

      case GuestErrorCode.RATE_LIMIT_EXCEEDED:
      case GuestErrorCode.CONCURRENT_ACCESS_LIMIT:
        return 429; // Too Many Requests

      case GuestErrorCode.DATABASE_ERROR:
      case GuestErrorCode.INTERNAL_ERROR:
      case GuestErrorCode.RLS_POLICY_VIOLATION:
        return 500; // Internal Server Error

      case GuestErrorCode.NETWORK_ERROR:
        return 502; // Bad Gateway

      default:
        return 500;
    }
  }
}

/**
 * エラー統計情報の収集
 */
export interface ErrorStatistics {
  totalErrors: number;
  errorsByCode: Record<GuestErrorCode, number>;
  errorsBySeverity: Record<ErrorSeverity, number>;
  retryableErrors: number;
  nonRetryableErrors: number;
  timeRange: {
    start: Date;
    end: Date;
  };
}

/**
 * エラー統計コレクター
 */
export class GuestTokenErrorCollector {
  private errors: GuestTokenError[] = [];

  /**
   * エラーを記録
   */
  recordError(error: GuestTokenError): void {
    this.errors.push(error);
  }

  /**
   * 統計情報を生成
   */
  generateStatistics(timeRange?: { start: Date; end: Date }): ErrorStatistics {
    const filteredErrors = timeRange
      ? this.errors.filter(
          (error) => error.timestamp >= timeRange.start && error.timestamp <= timeRange.end
        )
      : this.errors;

    const errorsByCode: Record<GuestErrorCode, number> = {} as Record<GuestErrorCode, number>;
    const errorsBySeverity: Record<ErrorSeverity, number> = {} as Record<ErrorSeverity, number>;
    let retryableErrors = 0;
    let nonRetryableErrors = 0;

    filteredErrors.forEach((error) => {
      errorsByCode[error.code] = (errorsByCode[error.code] || 0) + 1;
      errorsBySeverity[error.severity] = (errorsBySeverity[error.severity] || 0) + 1;

      if (error.isRetryable) {
        retryableErrors++;
      } else {
        nonRetryableErrors++;
      }
    });

    return {
      totalErrors: filteredErrors.length,
      errorsByCode,
      errorsBySeverity,
      retryableErrors,
      nonRetryableErrors,
      timeRange: timeRange || {
        start: new Date(0),
        end: new Date(),
      },
    };
  }

  /**
   * エラーログをクリア
   */
  clear(): void {
    this.errors = [];
  }
}
