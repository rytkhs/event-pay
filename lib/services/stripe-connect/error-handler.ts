/**
 * StripeConnect エラーハンドラーの実装
 */

import Stripe from "stripe";
import type { PostgrestError } from "@supabase/supabase-js";
import { IStripeConnectErrorHandler } from "./interface";
import {
  StripeConnectError,
  StripeConnectErrorType,
  ErrorHandlingResult,
} from "./types";
import {
  ERROR_HANDLING_BY_TYPE,
  STRIPE_ERROR_CODE_MAPPING,
  POSTGRES_ERROR_CODE_MAPPING,
} from "./error-mapping";

/**
 * StripeConnect エラーハンドラーの実装クラス
 */
export class StripeConnectErrorHandler implements IStripeConnectErrorHandler {
  /**
   * StripeConnectエラーを処理する
   */
  async handleError(error: StripeConnectError): Promise<ErrorHandlingResult> {
    const handling = ERROR_HANDLING_BY_TYPE[error.type] || ERROR_HANDLING_BY_TYPE[StripeConnectErrorType.UNKNOWN_ERROR];

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
      const errorType = (stripeError.code && STRIPE_ERROR_CODE_MAPPING[stripeError.code]) ||
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
  mapDatabaseError(dbError: Error, context: string): StripeConnectError {
    // PostgrestErrorの場合
    if (this.isPostgrestError(dbError)) {
      const postgrestError = dbError as PostgrestError;
      let errorType = POSTGRES_ERROR_CODE_MAPPING[postgrestError.code] ||
        StripeConnectErrorType.DATABASE_ERROR;

      // UNIQUE違反(23505)のうち、stripe_account_id衝突を明示的に分類
      // detailsに衝突カラムが含まれることが多いため、簡易に判定
      const isStripeAccountIdConflict =
        postgrestError.code === "23505" &&
        typeof postgrestError.details === "string" &&
        /stripe_account_id/i.test(postgrestError.details);
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
  private getStripeErrorTypeByClass(stripeError: Stripe.errors.StripeError): StripeConnectErrorType {
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
  private isPostgrestError(error: Error): error is PostgrestError {
    return 'code' in error && 'details' in error && 'hint' in error;
  }

  /**
   * エラーログを出力する
   */
  private logError(error: StripeConnectError, level: 'info' | 'warn' | 'error'): void {
    const logData = {
      timestamp: new Date().toISOString(),
      level,
      service: 'stripe-connect',
      errorType: error.type,
      message: error.message,
      metadata: error.metadata,
      stack: error.stack,
      originalError: error.originalError ? {
        name: error.originalError.name,
        message: error.originalError.message,
        stack: error.originalError.stack,
      } : undefined,
    };

    switch (level) {
      case 'info':
        console.info('StripeConnect Info:', logData);
        break;
      case 'warn':
        console.warn('StripeConnect Warning:', logData);
        break;
      case 'error':
        console.error('StripeConnect Error:', logData);
        break;
    }
  }

  /**
   * 管理者に通知する（実装は後続タスクで詳細化）
   */
  private async notifyAdmin(error: StripeConnectError): Promise<void> {
    // TODO: 実際の通知実装（メール、Slack、ログ集約システムなど）
    console.error('Admin notification required for StripeConnect error:', {
      type: error.type,
      message: error.message,
      metadata: error.metadata,
      timestamp: new Date().toISOString(),
    });
  }
}
