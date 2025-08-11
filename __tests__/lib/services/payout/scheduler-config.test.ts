/**
 * PayoutScheduler設定管理のテスト
 */

import {
  DEFAULT_SCHEDULER_CONFIG,
  loadSchedulerConfigFromEnv,
  createSchedulerConfig,
  validateSchedulerConfig,
  configToEnvString,
  getConfigDiff,
} from "@/lib/services/payout/scheduler-config";
import { PayoutSchedulerConfig } from "@/lib/services/payout/types";

describe("PayoutScheduler設定管理", () => {
  // 環境変数のバックアップ
  const originalEnv = process.env;

  beforeEach(() => {
    // 環境変数をリセット
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    // 環境変数を復元
    process.env = originalEnv;
  });

  describe("DEFAULT_SCHEDULER_CONFIG", () => {
    it("デフォルト設定が正しく定義されている", () => {
      expect(DEFAULT_SCHEDULER_CONFIG).toEqual({
        daysAfterEvent: 5,
        minimumAmount: 100,
        maxEventsPerRun: 100,
        maxConcurrency: 3,
        delayBetweenBatches: 1000,
        retryFailedPayouts: false,
        enableLogging: true,
        logRetentionDays: 30,
      });
    });
  });

  describe("loadSchedulerConfigFromEnv", () => {
    it("環境変数から設定を正しく読み込む", () => {
      process.env.PAYOUT_SCHEDULER_DAYS_AFTER_EVENT = "7";
      process.env.PAYOUT_SCHEDULER_MINIMUM_AMOUNT = "200";
      process.env.PAYOUT_SCHEDULER_MAX_EVENTS_PER_RUN = "50";
      process.env.PAYOUT_SCHEDULER_MAX_CONCURRENCY = "5";
      process.env.PAYOUT_SCHEDULER_DELAY_BETWEEN_BATCHES = "2000";
      process.env.PAYOUT_SCHEDULER_RETRY_FAILED_PAYOUTS = "true";
      process.env.PAYOUT_SCHEDULER_ENABLE_LOGGING = "false";
      process.env.PAYOUT_SCHEDULER_LOG_RETENTION_DAYS = "60";

      const config = loadSchedulerConfigFromEnv();

      expect(config).toEqual({
        daysAfterEvent: 7,
        minimumAmount: 200,
        maxEventsPerRun: 50,
        maxConcurrency: 5,
        delayBetweenBatches: 2000,
        retryFailedPayouts: true,
        enableLogging: false,
        logRetentionDays: 60,
      });
    });

    it("無効な環境変数は無視する", () => {
      process.env.PAYOUT_SCHEDULER_DAYS_AFTER_EVENT = "invalid";
      process.env.PAYOUT_SCHEDULER_MINIMUM_AMOUNT = "-100";
      process.env.PAYOUT_SCHEDULER_MAX_EVENTS_PER_RUN = "0";

      const config = loadSchedulerConfigFromEnv();

      expect(config).toEqual({});
    });

    it("環境変数が設定されていない場合は空のオブジェクトを返す", () => {
      const config = loadSchedulerConfigFromEnv();
      expect(config).toEqual({});
    });
  });

  describe("createSchedulerConfig", () => {
    it("デフォルト設定と環境変数、オーバーライドを正しくマージする", () => {
      process.env.PAYOUT_SCHEDULER_DAYS_AFTER_EVENT = "7";
      process.env.PAYOUT_SCHEDULER_MINIMUM_AMOUNT = "200";

      const config = createSchedulerConfig({
        maxEventsPerRun: 150,
        enableLogging: false,
      });

      expect(config).toEqual({
        daysAfterEvent: 7, // 環境変数
        minimumAmount: 200, // 環境変数
        maxEventsPerRun: 150, // オーバーライド
        maxConcurrency: 3, // デフォルト
        delayBetweenBatches: 1000, // デフォルト
        retryFailedPayouts: false, // デフォルト
        enableLogging: false, // オーバーライド
        logRetentionDays: 30, // デフォルト
      });
    });
  });

  describe("validateSchedulerConfig", () => {
    it("有効な設定の場合はバリデーションを通す", () => {
      const config: PayoutSchedulerConfig = {
        daysAfterEvent: 5,
        minimumAmount: 100,
        maxEventsPerRun: 50,
        maxConcurrency: 3,
        delayBetweenBatches: 1000,
        retryFailedPayouts: false,
        enableLogging: true,
        logRetentionDays: 30,
      };

      const result = validateSchedulerConfig(config);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("無効な設定の場合はエラーを返す", () => {
      const config: PayoutSchedulerConfig = {
        daysAfterEvent: -1, // 負の値
        minimumAmount: -100, // 負の値
        maxEventsPerRun: 0, // ゼロ
        maxConcurrency: -1, // 負の値
        delayBetweenBatches: -500, // 負の値
        retryFailedPayouts: false,
        enableLogging: true,
        logRetentionDays: 0, // ゼロ
      };

      const result = validateSchedulerConfig(config);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("daysAfterEvent must be non-negative");
      expect(result.errors).toContain("minimumAmount must be non-negative");
      expect(result.errors).toContain("maxEventsPerRun must be positive");
      expect(result.errors).toContain("maxConcurrency must be positive");
      expect(result.errors).toContain("delayBetweenBatches must be non-negative");
      expect(result.errors).toContain("logRetentionDays must be positive");
    });

    it("実用的な制限値をチェックする", () => {
      const config: PayoutSchedulerConfig = {
        daysAfterEvent: 5,
        minimumAmount: 100,
        maxEventsPerRun: 2000, // 制限値超過
        maxConcurrency: 20, // 制限値超過
        delayBetweenBatches: 120000, // 制限値超過
        retryFailedPayouts: false,
        enableLogging: true,
        logRetentionDays: 30,
      };

      const result = validateSchedulerConfig(config);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("maxEventsPerRun should not exceed 1000 for performance reasons");
      expect(result.errors).toContain("maxConcurrency should not exceed 10 to avoid API rate limits");
      expect(result.errors).toContain("delayBetweenBatches should not exceed 60000ms (1 minute)");
    });
  });

  describe("configToEnvString", () => {
    it("設定を環境変数形式の文字列に変換する", () => {
      const config: PayoutSchedulerConfig = {
        daysAfterEvent: 7,
        minimumAmount: 200,
        maxEventsPerRun: 50,
        maxConcurrency: 5,
        delayBetweenBatches: 2000,
        retryFailedPayouts: true,
        enableLogging: false,
        logRetentionDays: 60,
      };

      const envString = configToEnvString(config);

      expect(envString).toBe([
        "PAYOUT_SCHEDULER_DAYS_AFTER_EVENT=7",
        "PAYOUT_SCHEDULER_MINIMUM_AMOUNT=200",
        "PAYOUT_SCHEDULER_MAX_EVENTS_PER_RUN=50",
        "PAYOUT_SCHEDULER_MAX_CONCURRENCY=5",
        "PAYOUT_SCHEDULER_DELAY_BETWEEN_BATCHES=2000",
        "PAYOUT_SCHEDULER_RETRY_FAILED_PAYOUTS=true",
        "PAYOUT_SCHEDULER_ENABLE_LOGGING=false",
        "PAYOUT_SCHEDULER_LOG_RETENTION_DAYS=60",
      ].join('\n'));
    });
  });

  describe("getConfigDiff", () => {
    it("設定の差分を正しく取得する", () => {
      const currentConfig: PayoutSchedulerConfig = {
        daysAfterEvent: 5,
        minimumAmount: 100,
        maxEventsPerRun: 100,
        maxConcurrency: 3,
        delayBetweenBatches: 1000,
        retryFailedPayouts: false,
        enableLogging: true,
        logRetentionDays: 30,
      };

      const newConfig: PayoutSchedulerConfig = {
        daysAfterEvent: 7, // 変更
        minimumAmount: 100, // 変更なし
        maxEventsPerRun: 50, // 変更
        maxConcurrency: 3, // 変更なし
        delayBetweenBatches: 1000, // 変更なし
        retryFailedPayouts: true, // 変更
        enableLogging: true, // 変更なし
        logRetentionDays: 30, // 変更なし
      };

      const diff = getConfigDiff(currentConfig, newConfig);

      expect(diff).toHaveLength(3);
      expect(diff).toContainEqual({
        key: "daysAfterEvent",
        oldValue: 5,
        newValue: 7,
      });
      expect(diff).toContainEqual({
        key: "maxEventsPerRun",
        oldValue: 100,
        newValue: 50,
      });
      expect(diff).toContainEqual({
        key: "retryFailedPayouts",
        oldValue: false,
        newValue: true,
      });
    });

    it("差分がない場合は空の配列を返す", () => {
      const config: PayoutSchedulerConfig = {
        daysAfterEvent: 5,
        minimumAmount: 100,
        maxEventsPerRun: 100,
        maxConcurrency: 3,
        delayBetweenBatches: 1000,
        retryFailedPayouts: false,
        enableLogging: true,
        logRetentionDays: 30,
      };

      const diff = getConfigDiff(config, config);

      expect(diff).toHaveLength(0);
    });
  });
});
