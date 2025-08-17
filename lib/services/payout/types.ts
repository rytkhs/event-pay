/**
 * PayoutService関連の型定義
 */

import { Database } from "@/types/database";

// 送金ステータスの型（データベースのenumに合わせる）
export type PayoutStatus = Database["public"]["Enums"]["payout_status_enum"];

// 送金レコードの型（データベーススキーマに合わせる）
export interface Payout {
  id: string;
  event_id: string;
  user_id: string;
  total_stripe_sales: number;
  total_stripe_fee: number;
  platform_fee: number;
  net_payout_amount: number;
  status: PayoutStatus;
  stripe_transfer_id: string | null;
  stripe_account_id: string;
  webhook_event_id: string | null;
  webhook_processed_at: string | null;
  processed_at: string | null;
  notes: string | null;
  retry_count: number;
  last_error: string | null;
  transfer_group: string | null;
  created_at: string;
  updated_at: string;
}

// 送金対象イベント情報
export interface EligibleEvent {
  id: string;
  title: string;
  date: string;
  fee: number;
  created_by: string;
  created_at: string;
  // 決済完了済みの参加者数
  paid_attendances_count: number;
  // 総売上（Stripe決済のみ）
  total_stripe_sales: number;
}

// 送金処理実行パラメータ
export interface ProcessPayoutParams {
  eventId: string;
  userId: string;
  notes?: string;
}

// 送金処理実行結果
export interface ProcessPayoutResult {
  payoutId: string;
  transferId: string | null;
  netAmount: number;
  estimatedArrival?: string;
  rateLimitInfo?: {
    hitRateLimit: boolean;
    suggestedDelayMs?: number;
    retriedCount: number;
  };
}

// 送金金額計算結果
export interface PayoutCalculation {
  totalStripeSales: number;
  totalStripeFee: number;
  platformFee: number;
  netPayoutAmount: number;
  breakdown: {
    stripePaymentCount: number;
    averageTransactionAmount: number;
    stripeFeeRate: number;
    platformFeeRate: number;
  };
}

// 送金ステータス更新パラメータ
export interface UpdatePayoutStatusParams {
  payoutId: string;
  status: PayoutStatus;
  processedAt?: Date;
  stripeTransferId?: string;
  transferGroup?: string;
  lastError?: string;
  notes?: string;
}

// 送金履歴取得パラメータ
export interface GetPayoutHistoryParams {
  userId: string;
  limit?: number;
  offset?: number;
  status?: PayoutStatus;
  eventId?: string;
}

// 送金エラーの種類
export enum PayoutErrorType {
  // ユーザーエラー
  VALIDATION_ERROR = "VALIDATION_ERROR",
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",

  // ビジネスロジックエラー
  EVENT_NOT_FOUND = "EVENT_NOT_FOUND",
  EVENT_NOT_ELIGIBLE = "EVENT_NOT_ELIGIBLE",
  PAYOUT_ALREADY_EXISTS = "PAYOUT_ALREADY_EXISTS",
  PAYOUT_NOT_FOUND = "PAYOUT_NOT_FOUND",
  STRIPE_ACCOUNT_NOT_READY = "STRIPE_ACCOUNT_NOT_READY",
  INSUFFICIENT_BALANCE = "INSUFFICIENT_BALANCE",
  INVALID_STATUS_TRANSITION = "INVALID_STATUS_TRANSITION",

  // システムエラー
  STRIPE_API_ERROR = "STRIPE_API_ERROR",
  DATABASE_ERROR = "DATABASE_ERROR",
  CALCULATION_ERROR = "CALCULATION_ERROR",

  // 外部サービスエラー
  STRIPE_CONNECT_ERROR = "STRIPE_CONNECT_ERROR",
  TRANSFER_CREATION_FAILED = "TRANSFER_CREATION_FAILED",
  // Stripe 失敗後にステータス更新も失敗
  UPDATE_STATUS_FAILED = "UPDATE_STATUS_FAILED",
}

// 送金エラークラス
export class PayoutError extends Error {
  constructor(
    public type: PayoutErrorType,
    message: string,
    public cause?: Error,
    public metadata?: Record<string, unknown>
  ) {
    super(message);
    this.name = "PayoutError";
  }
}

/**
 * Stripe Transfer 失敗 と updatePayoutStatus 失敗の両方を保持する複合エラー
 */
export class AggregatePayoutError extends PayoutError {
  constructor(
    public readonly original: Error, // Stripe Transfer 失敗
    public readonly statusUpdateError: Error // updatePayoutStatus 失敗
  ) {
    super(
      PayoutErrorType.UPDATE_STATUS_FAILED,
      `Stripe Transfer 失敗後、ステータス更新も失敗: ${original.message} / ${statusUpdateError.message}`,
      original
    );
    this.name = "AggregatePayoutError";
  }
}

// エラーハンドリング結果
export interface ErrorHandlingResult {
  userMessage: string;
  shouldRetry: boolean;
  logLevel: "info" | "warn" | "error";
  shouldNotifyAdmin: boolean;
}

// 送金対象イベント検索条件
export interface FindEligibleEventsParams {
  // イベント終了から何日後に送金対象とするか（デフォルト: 5日）
  daysAfterEvent?: number;
  // 最小売上金額（これ以下は送金しない）
  minimumAmount?: number;
  // 特定のユーザーのイベントのみ検索
  userId?: string;
  // 検索結果の上限
  limit?: number;
}

// Stripe手数料計算設定
export interface StripeFeeConfig {
  // 基本手数料率（デフォルト: 3.6%）
  baseRate: number;
  // 固定手数料（円、デフォルト: 0円）
  fixedFee: number;
}

// プラットフォーム手数料計算設定
export interface PlatformFeeConfig {
  // 手数料率（MVP段階では0%）
  rate: number;
  // 固定手数料（円）
  fixedFee: number;
  // 最小手数料（円）
  minimumFee: number;
  // 最大手数料（円）
  maximumFee: number;
}

// PayoutScheduler関連の型定義

// スケジューラー設定
export interface PayoutSchedulerConfig {
  // イベント終了から何日後に送金対象とするか
  daysAfterEvent: number;
  // 最小売上金額
  minimumAmount: number;
  // 1回の実行で処理する最大イベント数
  maxEventsPerRun: number;
  // 最大並行処理数
  maxConcurrency: number;
  // バッチ間の遅延（ミリ秒）
  delayBetweenBatches: number;
  // 失敗した送金の再試行を行うか
  retryFailedPayouts: boolean;
  // ログ記録を有効にするか
  enableLogging: boolean;
  // ログ保持期間（日数）
  logRetentionDays: number;
}

// スケジューラー実行結果
export interface SchedulerExecutionResult {
  executionId: string;
  startTime: Date;
  endTime: Date;
  eligibleEventsCount: number;
  successfulPayouts: number;
  failedPayouts: number;
  totalAmount: number;
  results: Array<{
    eventId: string;
    eventTitle: string;
    userId: string;
    success: boolean;
    payoutId?: string;
    transferId?: string;
    amount?: number;
    estimatedArrival?: string;
    error?: string;
    note?: string; // 競合処理などの特記事項
    dryRun?: boolean;
  }>;
  summary?: {
    totalEvents: number;
    eligibleCount: number;
    ineligibleCount: number;
    totalEligibleAmount: number;
  };
  error?: string;
  dryRun: boolean;
}

// スケジューラー実行ログ
export interface PayoutSchedulerLog {
  id: string;
  execution_id: string;
  start_time: string;
  end_time: string;
  processing_time_ms: number;
  eligible_events_count: number;
  successful_payouts: number;
  failed_payouts: number;
  total_amount: number;
  dry_run: boolean;
  error_message: string | null;
  results: SchedulerExecutionResult['results'];
  summary: SchedulerExecutionResult['summary'] | null;
  created_at: string;
}

// 挿入用の型（DBのデフォルトでid/created_atが付与されるため省略）
export type NewPayoutSchedulerLogInsert = Omit<PayoutSchedulerLog, "id" | "created_at">;

// スケジューラー実行サマリー
export interface SchedulerExecutionSummary {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  totalPayoutsProcessed: number;
  totalAmountProcessed: number;
  averageProcessingTime: number;
}

// 送金対象イベント（推定送金額付き）
export interface EligibleEventWithAmount extends EligibleEvent {
  estimated_payout_amount?: number;
}

// 手動送金実行条件検証結果
export interface ManualPayoutEligibilityResult {
  eligible: boolean;
  reasons: string[];
  details: {
    // イベント終了5日経過チェック
    eventEndedDaysAgo?: number;
    eventEndedCheck: boolean;

    // 自動送金実行状況チェック
    autoPayoutScheduled: boolean;
    autoPayoutOverdue: boolean;
    autoPayoutFailed: boolean;
    autoPayoutStatus?: PayoutStatus;

    // Stripe Connectアカウント状態チェック
    stripeAccountReady: boolean;
    stripeAccountStatus?: string;
    payoutsEnabled: boolean;

    // 送金対象金額チェック
    estimatedAmount?: number;
    minimumAmountMet: boolean;

    // 重複送金防止チェック
    duplicatePayoutExists: boolean;
    existingPayoutStatus?: PayoutStatus;
  };
}

// 手動送金実行条件検証パラメータ
export interface ValidateManualPayoutParams {
  eventId: string;
  userId: string;
  minimumAmount?: number; // デフォルト: 100円
  daysAfterEvent?: number; // デフォルト: 5日
}

// ---------------------------------------
// 送金金額詳細計算用型定義（旧 calculation.ts より移動）
// ---------------------------------------
export interface PaymentData {
  amount: number;
  method: string;
  status: string;
}

export interface FeeCalculationResult {
  totalAmount: number;
  totalFee: number;
  breakdown: {
    paymentCount: number;
    averageAmount: number;
    feeRate: number;
    perTransactionFees: number[];
  };
}

export interface DetailedPayoutCalculation {
  totalStripeSales: number;
  totalStripeFee: number;
  platformFee: number;
  netPayoutAmount: number;
  breakdown: {
    stripePaymentCount: number;
    averageTransactionAmount: number;
    stripeFeeRate: number;
    platformFeeRate: number;
    stripeFeeBreakdown: number[];
    platformFeeBreakdown: {
      rateFee: number;
      fixedFee: number;
      minimumFeeApplied: boolean;
      maximumFeeApplied: boolean;
    };
  };
  validation: {
    isValid: boolean;
    warnings: string[];
    errors: string[];
  };
}
