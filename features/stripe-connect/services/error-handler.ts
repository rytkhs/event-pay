/**
 * StripeConnect エラーハンドラーの実装
 */

import type { PostgrestError } from "@supabase/supabase-js";
import Stripe from "stripe";

import { logger, type LogLevel } from "@core/logging/app-logger";
import { sendSlackText } from "@core/notification/slack";
import { handleServerError } from "@core/utils/error-handler.server";

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
          category: "stripe_connect",
          action: "error_handling",
          actor_type: "system",
          error_type: logData.errorType,
          message: logData.message,
          outcome: "success",
        });
        break;
      case "warn":
        logger.warn("StripeConnect Warning", {
          category: "stripe_connect",
          action: "error_handling",
          actor_type: "system",
          error_type: logData.errorType,
          message: logData.message,
          outcome: "failure",
        });
        break;
      case "error":
      case "critical":
        handleServerError("STRIPE_CONNECT_SERVICE_ERROR", {
          category: "stripe_connect",
          action: "error_handling",
          actorType: "system",
          additionalData: {
            error_type: logData.errorType,
            message: logData.message,
            metadata: logData.metadata,
          },
        });
        break;
    }
  }

  /**
   * 管理者に通知する
   */
  private async notifyAdmin(error: StripeConnectError): Promise<void> {
    // 監査ログ記録（通知は handleServerError が行うが、こちらでも必要な情報を残す）
    handleServerError("STRIPE_CONNECT_SERVICE_ERROR", {
      category: "stripe_connect",
      action: "admin_notification",
      actorType: "system",
      additionalData: {
        error_type: error.type,
        message: error.message,
        metadata: error.metadata,
        is_admin_notification: true,
      },
    });

    // Slack通知
    try {
      const timestamp = new Date().toISOString();
      const metadataStr = error.metadata
        ? `\nメタデータ: ${JSON.stringify(error.metadata, null, 2)}`
        : "";

      const slackText = `[StripeConnect Error Alert]
エラータイプ: ${error.type}
メッセージ: ${error.message}
発生時刻: ${timestamp}${metadataStr}`;

      const slackResult = await sendSlackText(slackText);

      if (!slackResult.success) {
        logger.warn("StripeConnect Slack notification failed", {
          category: "stripe_connect",
          action: "admin_notification",
          actor_type: "system",
          error_type: error.type,
          slack_error: slackResult.error,
          outcome: "failure",
        });
      }
    } catch (error) {
      handleServerError("STRIPE_CONNECT_SERVICE_ERROR", {
        category: "stripe_connect",
        action: "admin_notification_exception",
        actorType: "system",
        additionalData: {
          error_message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
}
