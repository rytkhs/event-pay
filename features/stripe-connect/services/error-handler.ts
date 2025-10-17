/**
 * StripeConnect エラーハンドラーの実装
 */

import type { PostgrestError } from "@supabase/supabase-js";
import Stripe from "stripe";

import { logger, type LogLevel } from "@core/logging/app-logger";

import {
  ERROR_HANDLING_BY_TYPE,
  STRIPE_ERROR_CODE_MAPPING,
  POSTGRES_ERROR_CODE_MAPPING,
} from "./error-mapping";
import { IStripeConnectErrorHandler } from "./interface";
import { StripeConnectError, StripeConnectErrorType, ErrorHandlingResult } from "./types";

/**
 * StripeConnect エラーハンドラーの実装クラス
 */
export class StripeConnectErrorHandler implements IStripeConnectErrorHandler {
  /**
   * StripeConnectエラーを処理する
   */
  async handleError(error: StripeConnectError): Promise<ErrorHandlingResult> {
    const handling =
      ERROR_HANDLING_BY_TYPE[error.type] ||
      ERROR_HANDLING_BY_TYPE[StripeConnectErrorType.UNKNOWN_ERROR];

    // エラーログの出力
    this.logError(error, handling.logLevel);

    // 管理者通知が必要な場合の処理（実装は後続タスクで）
    if (handling.shouldNotifyAdmin) {
      await this.notifyAdmin(error);
    }

    return handling;
  }

  /**
   * Stripe APIエラーをStripeConnectErrorにマッピングする
   */
  mapStripeError(stripeError: Error, context: string): StripeConnectError {
    if (stripeError instanceof Stripe.errors.StripeError) {
      const errorType =
        (stripeError.code && STRIPE_ERROR_CODE_MAPPING[stripeError.code]) ||
        this.getStripeErrorTypeByClass(stripeError);

      return new StripeConnectError(
        errorType,
        `Stripe API エラー (${context}): ${stripeError.message}`,
        stripeError,
        {
          context,
          stripeErrorCode: stripeError.code,
          stripeErrorType: stripeError.type,
          requestId: stripeError.requestId,
        }
      );
    }

    return new StripeConnectError(
      StripeConnectErrorType.STRIPE_API_ERROR,
      `Stripe API エラー (${context}): ${stripeError.message}`,
      stripeError,
      { context }
    );
  }

  /**
   * データベースエラーをStripeConnectErrorにマッピングする
   */
  mapDatabaseError(dbError: Error | PostgrestError, context: string): StripeConnectError {
    // PostgrestErrorの場合
    if (this.isPostgrestError(dbError)) {
      const postgrestError = dbError as PostgrestError;
      let errorType =
        POSTGRES_ERROR_CODE_MAPPING[postgrestError.code] || StripeConnectErrorType.DATABASE_ERROR;

      // UNIQUE違反(23505)のうち、stripe_account_id衝突を明示的に分類
      // 正確な制約名で判定（より安全で確実）
      const isStripeAccountIdConflict =
        postgrestError.code === "23505" &&
        typeof postgrestError.details === "string" &&
        (postgrestError.details.includes("stripe_connect_accounts_stripe_account_id_key") ||
          /stripe_account_id/i.test(postgrestError.details));
      if (isStripeAccountIdConflict) {
        errorType = StripeConnectErrorType.VALIDATION_ERROR;
      }

      return new StripeConnectError(
        errorType,
        `データベースエラー (${context}): ${postgrestError.message}`,
        dbError,
        {
          context,
          postgresCode: postgrestError.code,
          details: postgrestError.details,
          hint: postgrestError.hint,
          conflictOnStripeAccountId: isStripeAccountIdConflict || undefined,
        }
      );
    }

    return new StripeConnectError(
      StripeConnectErrorType.DATABASE_ERROR,
      `データベースエラー (${context}): ${dbError.message}`,
      dbError,
      { context }
    );
  }

  /**
   * Stripeエラーのクラスに基づいてエラータイプを判定する
   */
  private getStripeErrorTypeByClass(
    stripeError: Stripe.errors.StripeError
  ): StripeConnectErrorType {
    if (stripeError instanceof Stripe.errors.StripeCardError) {
      return StripeConnectErrorType.VALIDATION_ERROR;
    }

    if (stripeError instanceof Stripe.errors.StripeRateLimitError) {
      return StripeConnectErrorType.STRIPE_API_ERROR;
    }

    if (stripeError instanceof Stripe.errors.StripeInvalidRequestError) {
      return StripeConnectErrorType.VALIDATION_ERROR;
    }

    if (stripeError instanceof Stripe.errors.StripeAPIError) {
      return StripeConnectErrorType.STRIPE_API_ERROR;
    }

    if (stripeError instanceof Stripe.errors.StripeConnectionError) {
      return StripeConnectErrorType.STRIPE_API_ERROR;
    }

    if (stripeError instanceof Stripe.errors.StripeAuthenticationError) {
      return StripeConnectErrorType.STRIPE_API_ERROR;
    }

    return StripeConnectErrorType.STRIPE_API_ERROR;
  }

  /**
   * PostgrestErrorかどうかを判定する
   */
  private isPostgrestError(error: Error | PostgrestError): error is PostgrestError {
    return "code" in error && "details" in error && "hint" in error;
  }

  /**
   * エラーログを出力する
   */
  private logError(error: StripeConnectError, level: LogLevel): void {
    const logData = {
      timestamp: new Date().toISOString(),
      level,
      service: "stripe-connect",
      errorType: error.type,
      message: error.message,
      metadata: error.metadata,
      stack: error.stack,
      originalError: error.originalError
        ? {
            name: "name" in error.originalError ? error.originalError.name : "Unknown",
            message: error.originalError.message,
            stack: "stack" in error.originalError ? error.originalError.stack : undefined,
          }
        : undefined,
    };

    switch (level) {
      case "info":
        logger.info("StripeConnect Info", {
          tag: "stripeConnectInfo",
          service: "stripe-connect",
          error_type: logData.errorType,
          message: logData.message,
        });
        break;
      case "warn":
        logger.warn("StripeConnect Warning", {
          tag: "stripeConnectWarning",
          service: "stripe-connect",
          error_type: logData.errorType,
          message: logData.message,
        });
        break;
      case "error":
        logger.error("StripeConnect Error", {
          tag: "stripeConnectError",
          service: "stripe-connect",
          error_type: logData.errorType,
          message: logData.message,
          metadata: logData.metadata,
        });
        break;
    }
  }

  /**
   * 管理者に通知する（実装は後続タスクで詳細化）
   */
  private async notifyAdmin(error: StripeConnectError): Promise<void> {
    // TODO: 実際の通知実装（メール、Slack、ログ集約システムなど）
    logger.error("Admin notification required for StripeConnect error", {
      tag: "stripeConnectAdminNotification",
      service: "stripe-connect",
      error_type: error.type,
      message: error.message,
      metadata: error.metadata,
    });
  }
}
