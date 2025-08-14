/**
 * PayoutScheduler設定管理
 *
 * スケジューラーの設定値とデフォルト値を管理
 */

import { PayoutSchedulerConfig } from "./types";
import {
  DEFAULT_PAYOUT_DAYS_AFTER_EVENT,
  DEFAULT_PAYOUT_MAX_EVENTS_PER_RUN,
  DEFAULT_PAYOUT_MAX_CONCURRENCY,
  DEFAULT_PAYOUT_DELAY_BETWEEN_BATCHES,
} from "./constants";

/**
 * デフォルトのスケジューラー設定
 */
export const DEFAULT_SCHEDULER_CONFIG: PayoutSchedulerConfig = {
  // イベント終了から規定日数後に送金対象とする
  daysAfterEvent: DEFAULT_PAYOUT_DAYS_AFTER_EVENT,

  // 最小売上金額（これ以下は送金しない）- 実際の値はFeeConfigServiceから取得
  minimumAmount: 100, // デフォルト値、実行時に上書きされる

  // 1回の実行で処理する最大イベント数
  maxEventsPerRun: DEFAULT_PAYOUT_MAX_EVENTS_PER_RUN,

  // 最大並行処理数（Stripe API制限を考慮）
  maxConcurrency: DEFAULT_PAYOUT_MAX_CONCURRENCY,

  // バッチ間の遅延（ミリ秒）
  delayBetweenBatches: DEFAULT_PAYOUT_DELAY_BETWEEN_BATCHES,

  // 失敗した送金の再試行を行うか（現在は無効）
  retryFailedPayouts: false,

  // ログ記録を有効にする
  enableLogging: true,

  // ログ保持期間（30日）
  logRetentionDays: 30,
};

/**
 * 環境変数からスケジューラー設定を読み込む
 */
export function loadSchedulerConfigFromEnv(): Partial<PayoutSchedulerConfig> {
  const config: Partial<PayoutSchedulerConfig> = {};

  // 環境変数から設定を読み込み
  if (process.env.PAYOUT_SCHEDULER_DAYS_AFTER_EVENT) {
    const days = parseInt(process.env.PAYOUT_SCHEDULER_DAYS_AFTER_EVENT, 10);
    if (!isNaN(days) && days > 0) {
      config.daysAfterEvent = days;
    }
  }

  if (process.env.PAYOUT_SCHEDULER_MINIMUM_AMOUNT) {
    const amount = parseInt(process.env.PAYOUT_SCHEDULER_MINIMUM_AMOUNT, 10);
    if (!isNaN(amount) && amount >= 0) {
      config.minimumAmount = amount;
    }
  }

  if (process.env.PAYOUT_SCHEDULER_MAX_EVENTS_PER_RUN) {
    const maxEvents = parseInt(process.env.PAYOUT_SCHEDULER_MAX_EVENTS_PER_RUN, 10);
    if (!isNaN(maxEvents) && maxEvents > 0) {
      config.maxEventsPerRun = maxEvents;
    }
  }

  if (process.env.PAYOUT_SCHEDULER_MAX_CONCURRENCY) {
    const concurrency = parseInt(process.env.PAYOUT_SCHEDULER_MAX_CONCURRENCY, 10);
    if (!isNaN(concurrency) && concurrency > 0) {
      config.maxConcurrency = concurrency;
    }
  }

  if (process.env.PAYOUT_SCHEDULER_DELAY_BETWEEN_BATCHES) {
    const delay = parseInt(process.env.PAYOUT_SCHEDULER_DELAY_BETWEEN_BATCHES, 10);
    if (!isNaN(delay) && delay >= 0) {
      config.delayBetweenBatches = delay;
    }
  }

  if (process.env.PAYOUT_SCHEDULER_RETRY_FAILED_PAYOUTS) {
    config.retryFailedPayouts = process.env.PAYOUT_SCHEDULER_RETRY_FAILED_PAYOUTS === "true";
  }

  if (process.env.PAYOUT_SCHEDULER_ENABLE_LOGGING) {
    config.enableLogging = process.env.PAYOUT_SCHEDULER_ENABLE_LOGGING !== "false";
  }

  if (process.env.PAYOUT_SCHEDULER_LOG_RETENTION_DAYS) {
    const days = parseInt(process.env.PAYOUT_SCHEDULER_LOG_RETENTION_DAYS, 10);
    if (!isNaN(days) && days > 0) {
      config.logRetentionDays = days;
    }
  }

  return config;
}

/**
 * 完全なスケジューラー設定を作成する
 */
export function createSchedulerConfig(overrides?: Partial<PayoutSchedulerConfig>): PayoutSchedulerConfig {
  const envConfig = loadSchedulerConfigFromEnv();

  return {
    ...DEFAULT_SCHEDULER_CONFIG,
    ...envConfig,
    ...overrides,
  };
}

/**
 * 設定値の妥当性を検証する
 */
export function validateSchedulerConfig(config: PayoutSchedulerConfig): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (config.daysAfterEvent < 0) {
    errors.push("daysAfterEvent must be non-negative");
  }

  if (config.minimumAmount < 0) {
    errors.push("minimumAmount must be non-negative");
  }

  if (config.maxEventsPerRun <= 0) {
    errors.push("maxEventsPerRun must be positive");
  }

  if (config.maxConcurrency <= 0) {
    errors.push("maxConcurrency must be positive");
  }

  if (config.delayBetweenBatches < 0) {
    errors.push("delayBetweenBatches must be non-negative");
  }

  if (config.logRetentionDays <= 0) {
    errors.push("logRetentionDays must be positive");
  }

  // 実用的な制限値チェック
  if (config.maxEventsPerRun > 1000) {
    errors.push("maxEventsPerRun should not exceed 1000 for performance reasons");
  }

  if (config.maxConcurrency > 10) {
    errors.push("maxConcurrency should not exceed 10 to avoid API rate limits");
  }

  if (config.delayBetweenBatches > 60000) {
    errors.push("delayBetweenBatches should not exceed 60000ms (1 minute)");
  }

  // Stripe レート制限対応: 並列実行時は最低1秒の遅延を必須とする
  if (config.maxConcurrency > 1 && config.delayBetweenBatches < 1000) {
    errors.push(
      "delayBetweenBatches must be at least 1000ms when maxConcurrency > 1 to avoid Stripe rate limits. " +
      "Same Connect account transfers should be spaced at least 1 second apart."
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * 設定値を環境変数形式の文字列に変換する
 */
export function configToEnvString(config: PayoutSchedulerConfig): string {
  const envVars = [
    `PAYOUT_SCHEDULER_DAYS_AFTER_EVENT=${config.daysAfterEvent}`,
    `PAYOUT_SCHEDULER_MINIMUM_AMOUNT=${config.minimumAmount}`,
    `PAYOUT_SCHEDULER_MAX_EVENTS_PER_RUN=${config.maxEventsPerRun}`,
    `PAYOUT_SCHEDULER_MAX_CONCURRENCY=${config.maxConcurrency}`,
    `PAYOUT_SCHEDULER_DELAY_BETWEEN_BATCHES=${config.delayBetweenBatches}`,
    `PAYOUT_SCHEDULER_RETRY_FAILED_PAYOUTS=${config.retryFailedPayouts}`,
    `PAYOUT_SCHEDULER_ENABLE_LOGGING=${config.enableLogging}`,
    `PAYOUT_SCHEDULER_LOG_RETENTION_DAYS=${config.logRetentionDays}`,
  ];

  return envVars.join('\n');
}

/**
 * 設定値の差分を取得する
 */
export function getConfigDiff(
  currentConfig: PayoutSchedulerConfig,
  newConfig: PayoutSchedulerConfig
): Array<{
  key: keyof PayoutSchedulerConfig;
  oldValue: any;
  newValue: any;
}> {
  const diff: Array<{
    key: keyof PayoutSchedulerConfig;
    oldValue: any;
    newValue: any;
  }> = [];

  (Object.keys(currentConfig) as Array<keyof PayoutSchedulerConfig>).forEach(key => {
    if (currentConfig[key] !== newConfig[key]) {
      diff.push({
        key,
        oldValue: currentConfig[key],
        newValue: newConfig[key],
      });
    }
  });

  return diff;
}
