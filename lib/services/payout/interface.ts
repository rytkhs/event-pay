/**
 * PayoutServiceのインターフェース定義
 */

import {
  Payout,
  EligibleEvent,
  ProcessPayoutParams,
  ProcessPayoutResult,
  PayoutCalculation,
  UpdatePayoutStatusParams,
  GetPayoutHistoryParams,
  FindEligibleEventsParams,
  PayoutError,
  ErrorHandlingResult,
} from "./types";

/**
 * 送金サービスのメインインターフェース
 */
export interface IPayoutService {
  /**
   * 送金対象イベントを検索する
   * @param params 検索条件
   * @returns 送金対象イベントのリスト
   * @throws PayoutError 検索に失敗した場合
   */
  findEligibleEvents(params?: FindEligibleEventsParams): Promise<EligibleEvent[]>;

  /**
   * 送金処理を実行する
   * @param params 送金処理パラメータ
   * @returns 送金処理結果
   * @throws PayoutError 送金処理に失敗した場合
   */
  processPayout(params: ProcessPayoutParams): Promise<ProcessPayoutResult>;

  /**
   * 送金金額を計算する
   * @param eventId イベントID
   * @returns 送金金額計算結果
   * @throws PayoutError 計算に失敗した場合
   */
  calculatePayoutAmount(eventId: string): Promise<PayoutCalculation>;

  /**
   * 詳細な送金金額計算を実行する（管理者・デバッグ用）
   * @param eventId イベントID
   * @returns 詳細送金金額計算結果
   * @throws PayoutError 計算に失敗した場合
   */
  calculateDetailedPayoutAmount(eventId: string): Promise<import("./calculation").DetailedPayoutCalculation>;

  /**
   * 送金履歴を取得する
   * @param params 取得条件
   * @returns 送金履歴のリスト
   * @throws PayoutError 取得に失敗した場合
   */
  getPayoutHistory(params: GetPayoutHistoryParams): Promise<Payout[]>;

  /**
   * 送金ステータスを更新する
   * @param params 更新パラメータ
   * @throws PayoutError 更新に失敗した場合
   */
  updatePayoutStatus(params: UpdatePayoutStatusParams): Promise<void>;

  /**
   * 送金レコードを取得する
   * @param payoutId 送金ID
   * @returns 送金レコード（存在しない場合はnull）
   * @throws PayoutError 取得に失敗した場合
   */
  getPayoutById(payoutId: string): Promise<Payout | null>;

  /**
   * イベントの送金レコードを取得する
   * @param eventId イベントID
   * @param userId ユーザーID（権限チェック用）
   * @returns 送金レコード（存在しない場合はnull）
   * @throws PayoutError 取得に失敗した場合
   */
  getPayoutByEvent(eventId: string, userId: string): Promise<Payout | null>;

  /**
   * 送金処理を再実行する
   * @param payoutId 送金ID
   * @returns 再実行結果
   * @throws PayoutError 再実行に失敗した場合
   */
  retryPayout(payoutId: string): Promise<ProcessPayoutResult>;

  /**
   * 送金可能性をチェックする
   * @param eventId イベントID
   * @param userId ユーザーID
   * @returns 送金可能かどうかと理由
   * @throws PayoutError チェックに失敗した場合
   */
  checkPayoutEligibility(eventId: string, userId: string): Promise<{
    eligible: boolean;
    reason?: string;
    estimatedAmount?: number;
  }>;

  /**
   * Stripe Transfer情報を取得する
   * @param transferId Transfer ID
   * @returns Transfer情報
   * @throws PayoutError Transfer取得に失敗した場合
   */
  getTransferInfo(transferId: string): Promise<{
    id: string;
    amount: number;
    destination: string;
    status: string;
    created: Date;
    metadata: Record<string, string>;
  }>;

  /**
   * Stripe Transferをキャンセルする（可能な場合）
   * @param payoutId 送金ID
   * @returns キャンセル結果
   * @throws PayoutError キャンセルに失敗した場合
   */
  cancelTransfer(payoutId: string): Promise<{
    success: boolean;
    message: string;
  }>;

  /**
   * 手動送金実行条件を検証する
   * @param params 検証パラメータ
   * @returns 検証結果（実行可能かどうかと詳細な理由）
   * @throws PayoutError 検証処理に失敗した場合
   */
  validateManualPayoutEligibility(params: import("./types").ValidateManualPayoutParams): Promise<import("./types").ManualPayoutEligibilityResult>;
}

/**
 * 送金エラーハンドラーのインターフェース
 */
export interface IPayoutErrorHandler {
  /**
   * 送金エラーを処理し、適切な対応を決定する
   * @param error 発生したエラー
   * @returns エラーハンドリング結果
   */
  handlePayoutError(error: PayoutError): Promise<ErrorHandlingResult>;

  /**
   * エラーをログに記録する
   * @param error 発生したエラー
   * @param context 追加のコンテキスト情報
   */
  logError(error: PayoutError, context?: Record<string, unknown>): Promise<void>;
}

/**
 * 送金データ検証サービスのインターフェース
 */
export interface IPayoutValidator {
  /**
   * 送金処理パラメータを検証する
   * @param params 検証対象のパラメータ
   * @throws PayoutError バリデーションに失敗した場合
   */
  validateProcessPayoutParams(params: ProcessPayoutParams): Promise<void>;

  /**
   * イベントの送金対象性を検証する
   * @param eventId イベントID
   * @param userId ユーザーID
   * @throws PayoutError 検証に失敗した場合
   */
  validateEventEligibility(eventId: string, userId: string): Promise<void>;

  /**
   * Stripe Connectアカウントの送金可能性を検証する
   * @param userId ユーザーID
   * @throws PayoutError 検証に失敗した場合
   */
  validateStripeConnectAccount(userId: string): Promise<void>;

  /**
   * 送金金額の妥当性を検証する
   * @param amount 送金金額
   * @throws PayoutError 金額が無効な場合
   */
  validatePayoutAmount(amount: number): Promise<void>;

  /**
   * 送金ステータス遷移の妥当性を検証する
   * @param currentStatus 現在のステータス
   * @param newStatus 新しいステータス
   * @throws PayoutError 遷移が無効な場合
   */
  validateStatusTransition(currentStatus: string, newStatus: string): Promise<void>;

  /**
   * 手動送金実行条件を検証する
   * @param params 検証パラメータ
   * @returns 検証結果（実行可能かどうかと詳細な理由）
   * @throws PayoutError 検証処理に失敗した場合
   */
  validateManualPayoutEligibility(params: import("./types").ValidateManualPayoutParams): Promise<import("./types").ManualPayoutEligibilityResult>;
}

/**
 * Stripe Connectサービスのインターフェース（PayoutSchedulerで使用）
 */
export interface IStripeConnectService {
  /**
   * ユーザーのStripe Connectアカウント情報を取得する
   * @param userId ユーザーID
   * @returns Connectアカウント情報（存在しない場合はnull）
   */
  getConnectAccountByUser(userId: string): Promise<{
    stripe_account_id: string;
    status: string;
    charges_enabled: boolean;
    payouts_enabled: boolean;
  } | null>;
}

/**
 * 送金スケジューラーのインターフェース
 */
export interface IPayoutScheduler {
  /**
   * 送金対象イベントの詳細判定
   * @param options スケジューラーオプション
   * @returns 送金対象・対象外イベントの詳細情報
   */
  findEligibleEventsWithDetails(options?: {
    daysAfterEvent?: number;
    minimumAmount?: number;
    maxEventsPerRun?: number;
    userId?: string;
  }): Promise<{
    eligible: import("./types").EligibleEventWithAmount[];
    ineligible: Array<{
      event: import("./types").EligibleEvent;
      reason: string;
      details?: Record<string, any>;
    }>;
    summary: {
      totalEvents: number;
      eligibleCount: number;
      ineligibleCount: number;
      totalEligibleAmount: number;
    };
  }>;

  /**
   * 自動送金処理の実行
   * @param options 実行オプション
   * @returns 実行結果
   */
  executeScheduledPayouts(options?: {
    daysAfterEvent?: number;
    minimumAmount?: number;
    maxEventsPerRun?: number;
    maxConcurrency?: number;
    delayBetweenBatches?: number;
    retryFailedPayouts?: boolean;
    dryRun?: boolean;
  }): Promise<import("./types").SchedulerExecutionResult>;

  /**
   * スケジューラー実行ログの記録
   * @param result 実行結果
   */
  logSchedulerExecution(result: import("./types").SchedulerExecutionResult): Promise<void>;

  /**
   * スケジューラー実行履歴の取得
   * @param options 取得オプション
   * @returns 実行履歴とサマリー
   */
  getExecutionHistory(options?: {
    limit?: number;
    offset?: number;
    startDate?: Date;
    endDate?: Date;
    successOnly?: boolean;
  }): Promise<{
    logs: import("./types").PayoutSchedulerLog[];
    total: number;
    summary: import("./types").SchedulerExecutionSummary;
  }>;

  /**
   * 古いログの削除（保持期間を過ぎたもの）
   * @returns 削除されたログ数
   */
  cleanupOldLogs(): Promise<{ deletedCount: number }>;

  /**
   * 設定の更新
   * @param newConfig 新しい設定
   */
  updateConfig(newConfig: Partial<import("./types").PayoutSchedulerConfig>): void;

  /**
   * 現在の設定を取得
   * @returns 現在の設定
   */
  getConfig(): import("./types").PayoutSchedulerConfig;
}
