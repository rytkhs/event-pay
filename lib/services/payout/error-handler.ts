/**
 * PayoutErrorHandlerの実装
 */

import { IPayoutErrorHandler } from "./interface";
import { PayoutError, PayoutErrorType, ErrorHandlingResult } from "./types";
import { ERROR_HANDLING_BY_TYPE, STRIPE_ERROR_CODE_MAPPING, DATABASE_ERROR_CODE_MAPPING } from "./error-mapping";

/**
 * PayoutErrorHandlerの実装クラス
 */
export class PayoutErrorHandler implements IPayoutErrorHandler {
  /**
   * 送金エラーを処理し、適切な対応を決定する
   */
  async handlePayoutError(error: PayoutError): Promise<ErrorHandlingResult> {
    const defaultHandling: ErrorHandlingResult = {
      userMessage: "予期しないエラーが発生しました。管理者にお問い合わせください。",
      shouldRetry: false,
      logLevel: "error",
      shouldNotifyAdmin: true,
    };

    return ERROR_HANDLING_BY_TYPE[error.type] ?? defaultHandling;
  }

  /**
   * エラーをログに記録する
   */
  async logError(error: PayoutError, context?: Record<string, unknown>): Promise<void> {
    const logData = {
      timestamp: new Date().toISOString(),
      service: "payout",
      errorType: error.type,
      message: error.message,
      stack: error.stack,
      cause: error.cause?.message,
      metadata: error.metadata,
      context,
    };

    // 本番環境では構造化ログとして出力
    // 監視システム連携を前提にアプリ共通ロガーを使用
    const { logger } = await import("@/lib/logging/app-logger");
    logger.error("PayoutError", {
      tag: "payout",
      ...logData,
    });
  }

  /**
   * Stripeエラーを PayoutError にマッピングする
   */
  mapStripeError(stripeError: Error, context: string): PayoutError {
    const stripeErrorObj = stripeError as any;
    const errorCode = stripeErrorObj.code || stripeErrorObj.type || "unknown";

    const payoutErrorType = STRIPE_ERROR_CODE_MAPPING[errorCode] || PayoutErrorType.STRIPE_API_ERROR;

    return new PayoutError(
      payoutErrorType,
      `Stripe API エラー (${context}): ${stripeError.message}`,
      stripeError,
      {
        stripeErrorCode: errorCode,
        stripeErrorType: stripeErrorObj.type,
        context,
      }
    );
  }

  /**
   * データベースエラーを PayoutError にマッピングする
   */
  mapDatabaseError(dbError: Error, context: string): PayoutError {
    const dbErrorObj = dbError as any;
    const errorCode = dbErrorObj.code || "unknown";

    const payoutErrorType = DATABASE_ERROR_CODE_MAPPING[errorCode] || PayoutErrorType.DATABASE_ERROR;

    return new PayoutError(
      payoutErrorType,
      `データベースエラー (${context}): ${dbError.message}`,
      dbError,
      {
        databaseErrorCode: errorCode,
        context,
      }
    );
  }

  /**
   * 一般的なエラーを PayoutError にマッピングする
   */
  mapGenericError(error: Error, context: string, defaultType: PayoutErrorType = PayoutErrorType.DATABASE_ERROR): PayoutError {
    return new PayoutError(
      defaultType,
      `${context}: ${error.message}`,
      error,
      { context }
    );
  }
}
