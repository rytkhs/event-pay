/**
 * PayoutSchedulerユーティリティ関数のテスト
 */

import {
  generateExecutionSummary,
  formatProcessingTime,
  calculateExecutionStats,
  exportExecutionResultsToCSV,
  exportExecutionResultsToJSON,
  filterExecutionLogs,
  groupExecutionLogsByPeriod,
  validateExecutionResult,
} from "@/lib/services/payout/scheduler-utils";
import {
  SchedulerExecutionResult,
  PayoutSchedulerLog,
} from "@/lib/services/payout/types";

describe("PayoutSchedulerユーティリティ関数", () => {
  describe("generateExecutionSummary", () => {
    it("成功した実行のサマリーを生成する", () => {
      const result: SchedulerExecutionResult = {
        executionId: "test-1",
        startTime: new Date(),
        endTime: new Date(),
        eligibleEventsCount: 5,
        successfulPayouts: 5,
        failedPayouts: 0,
        totalAmount: 25000,
        results: [],
        dryRun: false,
      };

      const summary = generateExecutionSummary(result);

      expect(summary).toBe("送金処理完了: 5件成功（総額: ¥25,000）");
    });

    it("部分的に失敗した実行のサマリーを生成する", () => {
      const result: SchedulerExecutionResult = {
        executionId: "test-1",
        startTime: new Date(),
        endTime: new Date(),
        eligibleEventsCount: 5,
        successfulPayouts: 3,
        failedPayouts: 2,
        totalAmount: 15000,
        results: [],
        dryRun: false,
      };

      const summary = generateExecutionSummary(result);

      expect(summary).toBe("送金処理完了: 3件成功、2件失敗（成功率: 60%、総額: ¥15,000）");
    });

    it("ドライランのサマリーを生成する", () => {
      const result: SchedulerExecutionResult = {
        executionId: "test-1",
        startTime: new Date(),
        endTime: new Date(),
        eligibleEventsCount: 3,
        successfulPayouts: 0,
        failedPayouts: 0,
        totalAmount: 12000,
        results: [],
        dryRun: true,
      };

      const summary = generateExecutionSummary(result);

      expect(summary).toBe("ドライラン完了: 3件のイベントが送金対象（総額: ¥12,000）");
    });

    it("対象イベントがない場合のサマリーを生成する", () => {
      const result: SchedulerExecutionResult = {
        executionId: "test-1",
        startTime: new Date(),
        endTime: new Date(),
        eligibleEventsCount: 0,
        successfulPayouts: 0,
        failedPayouts: 0,
        totalAmount: 0,
        results: [],
        dryRun: false,
      };

      const summary = generateExecutionSummary(result);

      expect(summary).toBe("送金対象のイベントはありませんでした");
    });

    it("エラーが発生した場合のサマリーを生成する", () => {
      const result: SchedulerExecutionResult = {
        executionId: "test-1",
        startTime: new Date(),
        endTime: new Date(),
        eligibleEventsCount: 0,
        successfulPayouts: 0,
        failedPayouts: 0,
        totalAmount: 0,
        results: [],
        error: "データベース接続エラー",
        dryRun: false,
      };

      const summary = generateExecutionSummary(result);

      expect(summary).toBe("実行エラー: データベース接続エラー");
    });
  });

  describe("formatProcessingTime", () => {
    it("ミリ秒を正しくフォーマットする", () => {
      expect(formatProcessingTime(500)).toBe("500ms");
      expect(formatProcessingTime(1000)).toBe("1s");
      expect(formatProcessingTime(1500)).toBe("1.5s");
      expect(formatProcessingTime(60000)).toBe("1m");
      expect(formatProcessingTime(65000)).toBe("1m 5s");
      expect(formatProcessingTime(125000)).toBe("2m 5s");
    });
  });

  describe("calculateExecutionStats", () => {
    it("実行統計を正しく計算する", () => {
      const logs: PayoutSchedulerLog[] = [
        {
          id: "log-1",
          execution_id: "exec-1",
          start_time: "2025-01-01T10:00:00Z",
          end_time: "2025-01-01T10:05:00Z",
          processing_time_ms: 300000,
          eligible_events_count: 5,
          successful_payouts: 5,
          failed_payouts: 0,
          total_amount: 25000,
          dry_run: false,
          error_message: null,
          results: [],
          summary: null,
          created_at: "2025-01-01T10:05:00Z",
        },
        {
          id: "log-2",
          execution_id: "exec-2",
          start_time: "2025-01-02T10:00:00Z",
          end_time: "2025-01-02T10:02:00Z",
          processing_time_ms: 120000,
          eligible_events_count: 3,
          successful_payouts: 2,
          failed_payouts: 1,
          total_amount: 10000,
          dry_run: false,
          error_message: null,
          results: [],
          summary: null,
          created_at: "2025-01-02T10:02:00Z",
        },
        {
          id: "log-3",
          execution_id: "exec-3",
          start_time: "2025-01-03T10:00:00Z",
          end_time: "2025-01-03T10:01:00Z",
          processing_time_ms: 60000,
          eligible_events_count: 0,
          successful_payouts: 0,
          failed_payouts: 0,
          total_amount: 0,
          dry_run: false,
          error_message: "データベースエラー",
          results: [],
          summary: null,
          created_at: "2025-01-03T10:01:00Z",
        },
      ];

      const stats = calculateExecutionStats(logs);

      expect(stats).toEqual({
        totalExecutions: 3,
        successfulExecutions: 2,
        failedExecutions: 1,
        totalPayoutsProcessed: 7,
        totalAmountProcessed: 35000,
        averageProcessingTime: 160000,
      });
    });

    it("空のログ配列の場合はゼロ値を返す", () => {
      const stats = calculateExecutionStats([]);

      expect(stats).toEqual({
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        totalPayoutsProcessed: 0,
        totalAmountProcessed: 0,
        averageProcessingTime: 0,
      });
    });
  });

  describe("exportExecutionResultsToCSV", () => {
    it("実行結果をCSV形式に変換する", () => {
      const logs: PayoutSchedulerLog[] = [
        {
          id: "log-1",
          execution_id: "exec-1",
          start_time: "2025-01-01T10:00:00Z",
          end_time: "2025-01-01T10:05:00Z",
          processing_time_ms: 300000,
          eligible_events_count: 2,
          successful_payouts: 2,
          failed_payouts: 0,
          total_amount: 10000,
          dry_run: false,
          error_message: null,
          results: [],
          summary: null,
          created_at: "2025-01-01T10:05:00Z",
        },
      ];

      const csv = exportExecutionResultsToCSV(logs);

      const lines = csv.split('\n');
      expect(lines[0]).toBe('"実行ID","開始時刻","終了時刻","処理時間(ms)","対象イベント数","成功送金数","失敗送金数","総送金額","ドライラン","エラーメッセージ"');
      expect(lines[1]).toBe('"exec-1","2025-01-01T10:00:00Z","2025-01-01T10:05:00Z","300000","2","2","0","10000","いいえ",""');
    });

    it("エラーメッセージ内のダブルクォートを正しくエスケープする", () => {
      const logs: PayoutSchedulerLog[] = [
        {
          id: "log-1",
          execution_id: "exec-1",
          start_time: "2025-01-01T10:00:00Z",
          end_time: "2025-01-01T10:01:00Z",
          processing_time_ms: 60000,
          eligible_events_count: 0,
          successful_payouts: 0,
          failed_payouts: 0,
          total_amount: 0,
          dry_run: false,
          error_message: 'Database error: "connection failed"',
          results: [],
          summary: null,
          created_at: "2025-01-01T10:01:00Z",
        },
      ];

      const csv = exportExecutionResultsToCSV(logs);

      expect(csv).toContain('"Database error: ""connection failed"""');
    });
  });

  describe("filterExecutionLogs", () => {
    const logs: PayoutSchedulerLog[] = [
      {
        id: "log-1",
        execution_id: "exec-1",
        start_time: "2025-01-01T10:00:00Z",
        end_time: "2025-01-01T10:05:00Z",
        processing_time_ms: 300000,
        eligible_events_count: 2,
        successful_payouts: 2,
        failed_payouts: 0,
        total_amount: 10000,
        dry_run: false,
        error_message: null,
        results: [],
        summary: null,
        created_at: "2025-01-01T10:05:00Z",
      },
      {
        id: "log-2",
        execution_id: "exec-2",
        start_time: "2025-01-02T10:00:00Z",
        end_time: "2025-01-02T10:01:00Z",
        processing_time_ms: 60000,
        eligible_events_count: 0,
        successful_payouts: 0,
        failed_payouts: 0,
        total_amount: 0,
        dry_run: false,
        error_message: "エラーが発生しました",
        results: [],
        summary: null,
        created_at: "2025-01-02T10:01:00Z",
      },
      {
        id: "log-3",
        execution_id: "exec-3",
        start_time: "2025-01-03T10:00:00Z",
        end_time: "2025-01-03T10:02:00Z",
        processing_time_ms: 120000,
        eligible_events_count: 1,
        successful_payouts: 0,
        failed_payouts: 0,
        total_amount: 5000,
        dry_run: true,
        error_message: null,
        results: [],
        summary: null,
        created_at: "2025-01-03T10:02:00Z",
      },
    ];

    it("成功のみフィルタリングする", () => {
      const filtered = filterExecutionLogs(logs, { successOnly: true });
      expect(filtered).toHaveLength(2);
      expect(filtered.map(log => log.id)).toEqual(["log-1", "log-3"]);
    });

    it("失敗のみフィルタリングする", () => {
      const filtered = filterExecutionLogs(logs, { failedOnly: true });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe("log-2");
    });

    it("ドライランのみフィルタリングする", () => {
      const filtered = filterExecutionLogs(logs, { dryRunOnly: true });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe("log-3");
    });

    it("実際の実行のみフィルタリングする", () => {
      const filtered = filterExecutionLogs(logs, { actualRunOnly: true });
      expect(filtered).toHaveLength(2);
      expect(filtered.map(log => log.id)).toEqual(["log-1", "log-2"]);
    });

    it("金額でフィルタリングする", () => {
      const filtered = filterExecutionLogs(logs, {
        minAmount: 1000,
        maxAmount: 8000
      });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe("log-3");
    });

    it("日付でフィルタリングする", () => {
      const filtered = filterExecutionLogs(logs, {
        startDate: new Date("2025-01-02T00:00:00Z"),
        endDate: new Date("2025-01-02T23:59:59Z"),
      });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe("log-2");
    });
  });

  describe("groupExecutionLogsByPeriod", () => {
    const logs: PayoutSchedulerLog[] = [
      {
        id: "log-1",
        execution_id: "exec-1",
        start_time: "2025-01-01T10:00:00Z",
        end_time: "2025-01-01T10:05:00Z",
        processing_time_ms: 300000,
        eligible_events_count: 2,
        successful_payouts: 2,
        failed_payouts: 0,
        total_amount: 10000,
        dry_run: false,
        error_message: null,
        results: [],
        summary: null,
        created_at: "2025-01-01T10:05:00Z",
      },
      {
        id: "log-2",
        execution_id: "exec-2",
        start_time: "2025-01-01T15:00:00Z",
        end_time: "2025-01-01T15:02:00Z",
        processing_time_ms: 120000,
        eligible_events_count: 1,
        successful_payouts: 1,
        failed_payouts: 0,
        total_amount: 5000,
        dry_run: false,
        error_message: null,
        results: [],
        summary: null,
        created_at: "2025-01-01T15:02:00Z",
      },
      {
        id: "log-3",
        execution_id: "exec-3",
        start_time: "2025-01-02T10:00:00Z",
        end_time: "2025-01-02T10:01:00Z",
        processing_time_ms: 60000,
        eligible_events_count: 0,
        successful_payouts: 0,
        failed_payouts: 0,
        total_amount: 0,
        dry_run: false,
        error_message: "エラー",
        results: [],
        summary: null,
        created_at: "2025-01-02T10:01:00Z",
      },
    ];

    it("日別でグループ化する", () => {
      const grouped = groupExecutionLogsByPeriod(logs, "day");

      expect(Object.keys(grouped)).toEqual(["2025-01-01", "2025-01-02"]);
      expect(grouped["2025-01-01"].logs).toHaveLength(2);
      expect(grouped["2025-01-02"].logs).toHaveLength(1);
      expect(grouped["2025-01-01"].summary.totalPayoutsProcessed).toBe(3);
      expect(grouped["2025-01-01"].summary.totalAmountProcessed).toBe(15000);
    });

    it("月別でグループ化する", () => {
      const grouped = groupExecutionLogsByPeriod(logs, "month");

      expect(Object.keys(grouped)).toEqual(["2025-01"]);
      expect(grouped["2025-01"].logs).toHaveLength(3);
      expect(grouped["2025-01"].summary.totalExecutions).toBe(3);
    });
  });

  describe("validateExecutionResult", () => {
    it("有効な実行結果の場合は検証を通す", () => {
      const result: SchedulerExecutionResult = {
        executionId: "test-1",
        startTime: new Date("2025-01-01T10:00:00Z"),
        endTime: new Date("2025-01-01T10:05:00Z"),
        eligibleEventsCount: 3,
        successfulPayouts: 2,
        failedPayouts: 1,
        totalAmount: 10000,
        results: [
          { eventId: "e1", eventTitle: "Event 1", userId: "u1", success: true },
          { eventId: "e2", eventTitle: "Event 2", userId: "u2", success: true },
          { eventId: "e3", eventTitle: "Event 3", userId: "u3", success: false },
        ],
        dryRun: false,
      };

      const validation = validateExecutionResult(result);

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it("無効な実行結果の場合はエラーを返す", () => {
      const result: SchedulerExecutionResult = {
        executionId: "test-1",
        startTime: new Date("2025-01-01T10:05:00Z"),
        endTime: new Date("2025-01-01T10:00:00Z"), // 終了時刻が開始時刻より前
        eligibleEventsCount: 2,
        successfulPayouts: 2, // 対象イベント数を超過
        failedPayouts: 1, // 対象イベント数を超過（合計3 > 2）
        totalAmount: -1000, // 負の値
        results: [],
        dryRun: false,
      };

      const validation = validateExecutionResult(result);

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain("終了時刻が開始時刻より前になっています");
      expect(validation.errors).toContain("処理済み送金数が対象イベント数を超えています");
      expect(validation.errors).toContain("処理済み送金数が対象イベント数を超えています");
      expect(validation.errors).toContain("総送金額が負の値になっています");
    });

    it("警告レベルの問題を検出する", () => {
      const result: SchedulerExecutionResult = {
        executionId: "test-1",
        startTime: new Date("2025-01-01T10:00:00Z"),
        endTime: new Date("2025-01-01T10:10:00Z"), // 10分の処理時間
        eligibleEventsCount: 5,
        successfulPayouts: 0, // 対象があるのに成功がない
        failedPayouts: 3, // 失敗が成功より多い
        totalAmount: 0,
        results: [], // 結果数が対象イベント数と不一致
        dryRun: false,
      };

      const validation = validateExecutionResult(result);

      expect(validation.isValid).toBe(true); // エラーではないが警告あり
      expect(validation.warnings).toContain("対象イベントがあるにも関わらず成功した送金がありません");
      expect(validation.warnings).toContain("失敗した送金が成功した送金より多くなっています");
      expect(validation.warnings).toContain("結果の詳細数と対象イベント数が一致しません");
    });
  });
});
