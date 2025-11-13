/**
 * StatusSyncService
 * Stripe Connectアカウントのステータス同期を管理するサービス
 * リトライロジックと指数バックオフを実装
 */

import "server-only";

import Stripe from "stripe";

import { logger } from "@core/logging/app-logger";

import type { IStripeConnectService } from "./interface";

/**
 * Status Sync Error Type
 * エラーの種類を分類
 */
export enum StatusSyncErrorType {
  STRIPE_API_ERROR = "STRIPE_API_ERROR",
  NETWORK_ERROR = "NETWORK_ERROR",
  RATE_LIMIT_ERROR = "RATE_LIMIT_ERROR",
  DATABASE_ERROR = "DATABASE_ERROR",
  VALIDATION_ERROR = "VALIDATION_ERROR",
}

/**
 * Status Sync Error
 * ステータス同期処理のエラー
 */
export class StatusSyncError extends Error {
  constructor(
    public type: StatusSyncErrorType,
    message: string,
    public retryable: boolean,
    public originalError?: Error
  ) {
    super(message);
    this.name = "StatusSyncError";
  }
}

/**
 * Sync Options
 * 同期処理のオプション
 */
export interface SyncOptions {
  /** 最大リトライ回数 */
  maxRetries?: number;
  /** 初期バックオフ時間（ミリ秒） */
  initialBackoffMs?: number;
}

/**
 * StatusSyncService
 * Stripe Connectアカウントのステータス同期を管理
 */
export class StatusSyncService {
  private stripeConnectService: IStripeConnectService;

  constructor(stripeConnectService: IStripeConnectService) {
    this.stripeConnectService = stripeConnectService;
  }

  /**
   * アカウントステータスを同期する
   * リトライロジックと指数バックオフを実装
   * @param userId ユーザーID
   * @param accountId Stripe Account ID
   * @param options 同期オプション
   */
  async syncAccountStatus(
    userId: string,
    accountId: string,
    options: SyncOptions = {}
  ): Promise<void> {
    const maxRetries = options.maxRetries ?? 3;
    const initialBackoffMs = options.initialBackoffMs ?? 1000;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Stripeからアカウント情報を取得
        const accountInfo = await this.stripeConnectService.getAccountInfo(accountId);

        // データベースのステータスを更新（classificationMetadataとtriggerを含む）
        await this.stripeConnectService.updateAccountStatus({
          userId,
          status: accountInfo.status,
          chargesEnabled: accountInfo.chargesEnabled,
          payoutsEnabled: accountInfo.payoutsEnabled,
          stripeAccountId: accountId,
          classificationMetadata: accountInfo.classificationMetadata,
          trigger: "ondemand",
        });

        logger.info("Status sync successful", {
          tag: "statusSyncSuccess",
          user_id: userId,
          account_id: accountId,
          status: accountInfo.status,
          attempt: attempt + 1,
        });

        return;
      } catch (error) {
        lastError = error as Error;

        // エラーを分類
        const syncError = this.classifyError(error);

        logger.warn("Status sync attempt failed", {
          tag: "statusSyncAttemptFailed",
          user_id: userId,
          account_id: accountId,
          attempt: attempt + 1,
          max_retries: maxRetries,
          error_type: syncError.type,
          retryable: syncError.retryable,
          error_message: syncError.message,
        });

        // リトライ不可能なエラーまたは最終試行の場合は例外をスロー
        if (!syncError.retryable || attempt === maxRetries - 1) {
          logger.error("Status sync failed", {
            tag: "statusSyncFailed",
            user_id: userId,
            account_id: accountId,
            total_attempts: attempt + 1,
            error_type: syncError.type,
            error_message: syncError.message,
          });
          throw syncError;
        }

        // 指数バックオフで待機
        const backoffMs = initialBackoffMs * Math.pow(2, attempt);
        logger.info("Status sync retry scheduled", {
          tag: "statusSyncRetryScheduled",
          user_id: userId,
          account_id: accountId,
          attempt: attempt + 1,
          backoff_ms: backoffMs,
        });

        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    // 全てのリトライが失敗した場合
    throw new StatusSyncError(
      StatusSyncErrorType.STRIPE_API_ERROR,
      "Status sync failed after all retries",
      false,
      lastError
    );
  }

  /**
   * エラーを分類してStatusSyncErrorに変換
   * リトライ可否を判定する
   * @param error 元のエラー
   * @returns StatusSyncError
   */
  classifyError(error: unknown): StatusSyncError {
    // Stripe Rate Limit Error
    if (error instanceof Stripe.errors.StripeRateLimitError) {
      return new StatusSyncError(
        StatusSyncErrorType.RATE_LIMIT_ERROR,
        "Rate limit exceeded",
        true, // リトライ可能
        error
      );
    }

    // Stripe Connection Error（ネットワークエラー）
    if (error instanceof Stripe.errors.StripeConnectionError) {
      return new StatusSyncError(
        StatusSyncErrorType.NETWORK_ERROR,
        "Network connection failed",
        true, // リトライ可能
        error
      );
    }

    // Stripe API Error（サーバー側の一時的なエラー）
    if (error instanceof Stripe.errors.StripeAPIError) {
      return new StatusSyncError(
        StatusSyncErrorType.STRIPE_API_ERROR,
        "Stripe API error",
        true, // リトライ可能
        error
      );
    }

    // Stripe Invalid Request Error（リクエストの問題）
    if (error instanceof Stripe.errors.StripeInvalidRequestError) {
      // アカウントIDが無効な場合はリトライ不可
      const message = error.message?.toLowerCase() || "";
      if (message.includes("no such account") || message.includes("invalid account")) {
        return new StatusSyncError(
          StatusSyncErrorType.VALIDATION_ERROR,
          "Invalid account ID",
          false, // リトライ不可
          error
        );
      }
      // その他のバリデーションエラーもリトライ不可
      return new StatusSyncError(
        StatusSyncErrorType.VALIDATION_ERROR,
        "Invalid request",
        false, // リトライ不可
        error
      );
    }

    // Stripe Authentication Error（認証エラー）
    if (error instanceof Stripe.errors.StripeAuthenticationError) {
      return new StatusSyncError(
        StatusSyncErrorType.STRIPE_API_ERROR,
        "Authentication failed",
        false, // リトライ不可
        error
      );
    }

    // Stripe Permission Error（権限エラー）
    if (error instanceof Stripe.errors.StripePermissionError) {
      return new StatusSyncError(
        StatusSyncErrorType.STRIPE_API_ERROR,
        "Permission denied",
        false, // リトライ不可
        error
      );
    }

    // その他のStripe Error
    if (error instanceof Stripe.errors.StripeError) {
      // デフォルトではリトライ不可
      return new StatusSyncError(
        StatusSyncErrorType.STRIPE_API_ERROR,
        "Stripe error",
        false,
        error
      );
    }

    // Database Error（エラーメッセージから推測）
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (
        message.includes("database") ||
        message.includes("connection") ||
        message.includes("timeout")
      ) {
        return new StatusSyncError(
          StatusSyncErrorType.DATABASE_ERROR,
          "Database error",
          true, // リトライ可能
          error
        );
      }
    }

    // Unknown Error
    return new StatusSyncError(
      StatusSyncErrorType.STRIPE_API_ERROR,
      "Unknown error during status sync",
      false, // リトライ不可
      error as Error
    );
  }
}
