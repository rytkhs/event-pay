/**
 * Stripe Transfer実行の専用サービス
 * タスク7.3: Stripe Transfer実行の実装
 */

import Stripe from "stripe";
import { stripe } from "@/lib/stripe/client";
import { PayoutError, PayoutErrorType } from "./types";

/**
 * Stripe Transfer作成パラメータ
 *
 * 設計メモ（source_transaction について）:
 * - 本システムではイベント終了後に複数決済を集計して一括送金するため、
 *   典型的には単一の Charge/PaymentIntent に資金を厳密に結び付ける
 *   `source_transaction` は使用しない。
 * - 単一決済の直後に即時送金を行い資金可用性の確実性を高めたいケースのみ
 *   任意で指定する余地を残す（集計送金では未指定が妥当）。
 */
export interface CreateTransferParams {
  amount: number;
  currency: "jpy";
  destination: string;
  metadata: {
    payout_id: string;
    event_id: string;
    user_id: string;
    [key: string]: string;
  };
  description?: string;
  transferGroup?: string;
  sourceTransaction?: string; // 関連する支払いのID（資金可用性保証のため）
}

/**
 * Stripe Transfer作成結果
 */
export interface CreateTransferResult {
  transferId: string;
  amount: number;
  destination: string;
  status: string;
  created: number;
  estimatedArrival?: Date;
}

/**
 * Transfer再試行設定
 */
interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableErrorCodes: string[];
}

/**
 * Stripe Transfer実行サービス
 */
export class StripeTransferService {
  private stripe = stripe;
  private retryConfig: RetryConfig = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    retryableErrorCodes: [
      "rate_limit",
      "api_connection_error",
      "api_error",
    ],
  };

  /**
   * Stripe Transferを作成する
   * @param params Transfer作成パラメータ
   * @returns Transfer作成結果
   * @throws PayoutError Transfer作成に失敗した場合
   */
  async createTransfer(params: CreateTransferParams): Promise<CreateTransferResult> {
    try {
      // パラメータ検証
      this.validateTransferParams(params);

      // 冪等性キーを生成
      const idempotencyKey = this.generateIdempotencyKey(params);

      // Stripe Transfer作成（リトライ機能付き）
      const transfer = await this.createTransferWithRetry(params, idempotencyKey);

      // 結果を整形して返す
      return {
        transferId: transfer.id,
        amount: transfer.amount,
        destination: transfer.destination as string,
        status: (transfer as any).status || "pending",
        created: transfer.created,
        estimatedArrival: this.calculateEstimatedArrival(transfer.created),
      };

    } catch (error) {
      if (error instanceof PayoutError) {
        throw error;
      }

      // Stripe APIエラーを適切なPayoutErrorに変換
      throw this.handleStripeError(error as any, params as any);
    }
  }

  /**
   * Transfer情報を取得する
   * @param transferId Transfer ID
   * @returns Transfer情報
   * @throws PayoutError Transfer取得に失敗した場合
   */
  async getTransfer(transferId: string): Promise<Stripe.Transfer> {
    try {
      return await this.stripe.transfers.retrieve(transferId);
    } catch (error) {
      throw this.handleStripeError(error as any, { transferId });
    }
  }

  /**
   * Transferをキャンセルする（可能な場合）
   * @param transferId Transfer ID
   * @returns キャンセル結果
   * @throws PayoutError キャンセルに失敗した場合
   */
  async cancelTransfer(transferId: string): Promise<Stripe.Transfer> {
    try {
      // Stripe APIではTransferの直接キャンセルはサポートされていない
      // 代わりにTransfer Reversalを作成する
      const reversal = await this.stripe.transfers.createReversal(transferId);

      // 元のTransfer情報を取得して返す
      return await this.getTransfer(transferId);
    } catch (error) {
      throw this.handleStripeError(error as any, { transferId });
    }
  }

  /**
   * Transfer作成パラメータを検証する
   * @param params 検証対象のパラメータ
   * @throws PayoutError パラメータが無効な場合
   */
  private validateTransferParams(params: CreateTransferParams): void {
    // 金額検証
    if (!params.amount || params.amount <= 0) {
      throw new PayoutError(
        PayoutErrorType.VALIDATION_ERROR,
        "送金金額は1円以上である必要があります",
        undefined,
        { amount: params.amount }
      );
    }

    // 最大金額チェック（Stripeの制限: 1回あたり最大999,999,999円）
    if (params.amount > 999999999) {
      throw new PayoutError(
        PayoutErrorType.VALIDATION_ERROR,
        "送金金額が上限を超えています",
        undefined,
        { amount: params.amount, maxAmount: 999999999 }
      );
    }

    // 通貨検証
    if (params.currency !== "jpy") {
      throw new PayoutError(
        PayoutErrorType.VALIDATION_ERROR,
        "サポートされていない通貨です",
        undefined,
        { currency: params.currency }
      );
    }

    // 送金先アカウント検証
    if (!params.destination || !params.destination.startsWith("acct_")) {
      throw new PayoutError(
        PayoutErrorType.VALIDATION_ERROR,
        "無効な送金先アカウントIDです",
        undefined,
        { destination: params.destination }
      );
    }

    // メタデータ検証
    if (!params.metadata.payout_id || !params.metadata.event_id || !params.metadata.user_id) {
      throw new PayoutError(
        PayoutErrorType.VALIDATION_ERROR,
        "必須のメタデータが不足しています",
        undefined,
        { metadata: params.metadata }
      );
    }
  }

  /**
   * 冪等性キーを生成する
   * @param params Transfer作成パラメータ
   * @returns 冪等性キー
   */
  private generateIdempotencyKey(params: CreateTransferParams): string {
    const keyComponents = [
      "transfer",
      params.metadata.payout_id,
      params.amount.toString(),
      params.destination,
    ];

    if (params.transferGroup) {
      keyComponents.push(params.transferGroup);
    }

    return keyComponents.join(":");
  }

  /**
   * リトライ機能付きでStripe Transferを作成する
   * @param params Transfer作成パラメータ
   * @param idempotencyKey 冪等性キー
   * @returns 作成されたTransfer
   */
  private async createTransferWithRetry(
    params: CreateTransferParams,
    idempotencyKey: string
  ): Promise<Stripe.Transfer> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        // Stripe Transfer作成
        const transferParams: Stripe.TransferCreateParams = {
          amount: params.amount,
          currency: params.currency,
          destination: params.destination,
          metadata: params.metadata,
        };

        if (params.description) {
          transferParams.description = params.description;
        }

        if (params.transferGroup) {
          transferParams.transfer_group = params.transferGroup;
        }

        if (params.sourceTransaction) {
          transferParams.source_transaction = params.sourceTransaction;
        }

        // テスト環境では冪等性キーを使用しない（テストの独立性のため）
        const requestOptions = process.env.NODE_ENV === "test"
          ? {}
          : { idempotencyKey };

        return await this.stripe.transfers.create(transferParams, requestOptions);

      } catch (error) {
        lastError = error as Error;
        const stripeError = error as any;

        // リトライ可能なエラーかチェック
        if (attempt < this.retryConfig.maxRetries && this.isRetryableError(stripeError)) {
          // Retry-After ヘッダーが返っている場合はそれを優先
          let delay = this.calculateRetryDelay(attempt);
          try {
            const headersAny = (stripeError as unknown as { headers?: Record<string, string> } | { raw?: { headers?: Record<string, string> } }) || {};
            const h1 = (headersAny as any).headers as Record<string, string> | undefined;
            const h2 = (headersAny as any).raw?.headers as Record<string, string> | undefined;
            const retryAfterRaw = h1?.["retry-after"] ?? h1?.["Retry-After"] ?? h2?.["retry-after"] ?? h2?.["Retry-After"];
            if (retryAfterRaw !== undefined) {
              const retryAfterSec = Number.parseFloat(String(retryAfterRaw));
              if (Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
                const retryAfterMs = retryAfterSec * 1000;
                delay = Math.min(retryAfterMs, this.retryConfig.maxDelayMs);
              }
            }
          } catch (_e) {
            // ヘッダー解析に失敗した場合は指数バックオフにフォールバック
          }

          console.warn(
            `Stripe Transfer作成失敗 (試行 ${attempt + 1}/${this.retryConfig.maxRetries + 1}): ${stripeError.message}. ${delay}ms後に再試行します。`
          );

          await this.sleep(delay);
          continue;
        }

        // リトライ不可能なエラーまたは最大試行回数に達した場合は例外をスロー
        break;
      }
    }

    // すべての試行が失敗した場合
    throw lastError || new Error("Transfer作成に失敗しました");
  }

  /**
   * エラーがリトライ可能かどうかを判定する
   * @param error Stripeエラー
   * @returns リトライ可能な場合はtrue
   */
  private isRetryableError(error: any): boolean {
    // HTTPステータスコードによる判定
    if (error.statusCode) {
      // 5xx系エラー（サーバーエラー）はリトライ可能
      if (error.statusCode >= 500) {
        return true;
      }

      // 429 (Rate Limit)はリトライ可能
      if (error.statusCode === 429) {
        return true;
      }
    }

    // Stripeエラーコードによる判定
    if (error.code && this.retryConfig.retryableErrorCodes.includes(error.code)) {
      return true;
    }

    return false;
  }

  /**
   * リトライ遅延時間を計算する（指数バックオフ）
   * @param attempt 試行回数（0から開始）
   * @returns 遅延時間（ミリ秒）
   */
  private calculateRetryDelay(attempt: number): number {
    const delay = this.retryConfig.baseDelayMs * Math.pow(2, attempt);
    return Math.min(delay, this.retryConfig.maxDelayMs);
  }

  /**
   * 指定時間待機する
   * @param ms 待機時間（ミリ秒）
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 到着予定日を計算する
   * @param createdTimestamp Transfer作成タイムスタンプ
   * @returns 到着予定日
   */
  private calculateEstimatedArrival(createdTimestamp: number): Date {
    // Stripe Transferの到着予定は通常2-7営業日
    // 保守的に7営業日後を設定
    const createdDate = new Date(createdTimestamp * 1000);
    const estimatedDate = new Date(createdDate);

    // 7営業日を追加（土日を考慮して実際には10日後に設定）
    estimatedDate.setDate(estimatedDate.getDate() + 10);

    return estimatedDate;
  }

  /**
   * Stripe APIエラーを適切なPayoutErrorに変換する
   * @param error Stripeエラー
   * @param context エラーコンテキスト
   * @returns PayoutError
   */
  private handleStripeError(error: any, context?: Record<string, unknown>): PayoutError {
    const errorContext = {
      stripeErrorCode: error.code,
      stripeErrorType: error.type,
      statusCode: error.statusCode,
      ...context,
    };

    // Stripeエラーコード別の処理
    switch (error.code) {
      case "account_invalid":
      case "account_inactive":
        return new PayoutError(
          PayoutErrorType.STRIPE_ACCOUNT_NOT_READY,
          "送金先アカウントが無効または非アクティブです",
          error,
          errorContext
        );

      case "insufficient_funds":
        return new PayoutError(
          PayoutErrorType.INSUFFICIENT_BALANCE,
          "プラットフォームアカウントの残高が不足しています",
          error,
          errorContext
        );

      case "invalid_request_error":
        return new PayoutError(
          PayoutErrorType.VALIDATION_ERROR,
          `無効なリクエストです: ${error.message}`,
          error,
          errorContext
        );

      case "balance_insufficient":
        return new PayoutError(
          PayoutErrorType.INSUFFICIENT_BALANCE,
          "アカウント残高が不足しています",
          error,
          errorContext
        );

      case "rate_limit":
        return new PayoutError(
          PayoutErrorType.STRIPE_API_ERROR,
          "Stripe APIのレート制限に達しました。しばらく待ってから再試行してください。",
          error,
          errorContext
        );

      case "api_connection_error":
      case "api_error":
        return new PayoutError(
          PayoutErrorType.STRIPE_API_ERROR,
          `Stripe APIエラーが発生しました: ${error.message}`,
          error,
          errorContext
        );

      default:
        return new PayoutError(
          PayoutErrorType.TRANSFER_CREATION_FAILED,
          `Transfer作成に失敗しました: ${error.message}`,
          error,
          errorContext
        );
    }
  }
}

/**
 * デフォルトのStripeTransferServiceインスタンス
 */
export const stripeTransferService = new StripeTransferService();
