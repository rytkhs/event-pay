import { ERROR_REGISTRY } from "./registry";
import type { ErrorCode, ErrorSeverity, ErrorContext, ErrorCategory } from "./types";

/**
 * アプリケーション統一エラークラス
 * エラーコードに基づく一貫したプロパティ管理と、原因（Cause）の保持を行う
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly details: ErrorContext;
  public readonly severity: ErrorSeverity;
  public readonly userMessage: string;
  public readonly retryable: boolean;
  public readonly httpStatus: number;
  public readonly category: ErrorCategory;
  public readonly typeUri: string;
  public readonly correlationId?: string;

  constructor(
    code: ErrorCode,
    options: {
      message?: string; // 開発者用メッセージの上書き
      userMessage?: string; // ユーザー用メッセージの上書き
      cause?: unknown; // 元のエラー
      details?: ErrorContext; // 構造化データ
      severity?: ErrorSeverity; // 重要度の上書き
      correlationId?: string; // トレースID
      retryable?: boolean; // リトライ可能性の上書き
    } = {}
  ) {
    const isDefined = !!ERROR_REGISTRY[code];
    const def = isDefined ? ERROR_REGISTRY[code] : ERROR_REGISTRY["UNKNOWN_ERROR"];

    super(options.message || (isDefined ? def.message : `Undefined error code: ${code}`));

    this.name = "AppError";
    this.code = isDefined ? code : "UNKNOWN_ERROR";
    this.userMessage = options.userMessage || def.userMessage || "予期せぬエラーが発生しました。";
    this.severity = options.severity || def.severity;
    this.retryable = options.retryable ?? def.retryable;
    this.httpStatus = def.httpStatus;
    this.category = def.category;
    this.typeUri = def.typeUri;
    this.details = options.details || {};
    this.cause = options.cause;
    this.correlationId = options.correlationId;

    // スタックトレースの維持（V8系）
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  /**
   * JSONシリアライズ対応
   * メッセージとコード、メタデータのみを含め、Stackなどは除外
   */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      userMessage: this.userMessage,
      severity: this.severity,
      retryable: this.retryable,
      httpStatus: this.httpStatus,
      category: this.category,
      typeUri: this.typeUri,
      details: this.details,
      correlationId: this.correlationId,
    };
  }
}
