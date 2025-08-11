/**
 * PayoutSchedulerのテスト
 */

import { PayoutScheduler } from "@/lib/services/payout/scheduler";
import { PayoutService } from "@/lib/services/payout/service";
import { StripeConnectService } from "@/lib/services/stripe-connect/service";
import {
  PayoutSchedulerConfig,
  EligibleEvent,
  SchedulerExecutionResult,
  PayoutSchedulerLog,
} from "@/lib/services/payout/types";
import { createClient } from "@supabase/supabase-js";

// モック
jest.mock("@supabase/supabase-js");
jest.mock("@/lib/services/payout/service");
jest.mock("@/lib/services/stripe-connect/service");

const mockSupabase = {
  from: jest.fn(),
  rpc: jest.fn(),
};

const mockPayoutService = {
  findEligibleEvents: jest.fn(),
  checkPayoutEligibility: jest.fn(),
  calculatePayoutAmount: jest.fn(),
  processPayout: jest.fn(),
} as jest.Mocked<Partial<PayoutService>>;

const mockStripeConnectService = {
  getConnectAccountByUser: jest.fn(),
} as jest.Mocked<Partial<StripeConnectService>>;

describe("PayoutScheduler", () => {
  let scheduler: PayoutScheduler;

  beforeEach(() => {
    jest.clearAllMocks();

    (createClient as jest.Mock).mockReturnValue(mockSupabase);

    scheduler = new PayoutScheduler(
      mockPayoutService as any,
      mockStripeConnectService as any,
      "test-url",
      "test-key"
    );
  });

  describe("findEligibleEventsWithDetails", () => {
    it("送金対象イベントの詳細判定を正しく実行する", async () => {
      // テストデータ
      const mockEvents: EligibleEvent[] = [
        {
          id: "event-1",
          title: "テストイベント1",
          date: "2025-01-01",
          fee: 1000,
          created_by: "user-1",
          created_at: "2025-01-01T00:00:00Z",
          paid_attendances_count: 5,
          total_stripe_sales: 5000,
        },
        {
          id: "event-2",
          title: "テストイベント2",
          date: "2025-01-02",
          fee: 500,
          created_by: "user-2",
          created_at: "2025-01-02T00:00:00Z",
          paid_attendances_count: 2,
          total_stripe_sales: 1000,
        },
      ];

      // モック設定
      mockPayoutService.findEligibleEvents!.mockResolvedValue(mockEvents);

      mockStripeConnectService.getConnectAccountByUser!
        .mockResolvedValueOnce({
          stripe_account_id: "acct_1",
          status: "verified",
          charges_enabled: true,
          payouts_enabled: true,
        })
        .mockResolvedValueOnce({
          stripe_account_id: "acct_2",
          status: "verified",
          charges_enabled: true,
          payouts_enabled: false, // 送金無効
        });

      mockPayoutService.checkPayoutEligibility!
        .mockResolvedValueOnce({
          eligible: true,
          estimatedAmount: 4500,
        })
        .mockResolvedValueOnce({
          eligible: false,
          reason: "送金が有効になっていません",
        });

      mockPayoutService.calculatePayoutAmount!.mockResolvedValueOnce({
        totalStripeSales: 5000,
        totalStripeFee: 180,
        platformFee: 0,
        netPayoutAmount: 4820,
        breakdown: {
          stripePaymentCount: 5,
          averageTransactionAmount: 1000,
          stripeFeeRate: 0.036,
          platformFeeRate: 0,
        },
      });

      // 実行
      const result = await scheduler.findEligibleEventsWithDetails();

      // 検証
      expect(result.eligible).toHaveLength(1);
      expect(result.ineligible).toHaveLength(1);
      expect(result.summary.totalEvents).toBe(2);
      expect(result.summary.eligibleCount).toBe(1);
      expect(result.summary.ineligibleCount).toBe(1);
      expect(result.eligible[0].id).toBe("event-1");
      expect(result.ineligible[0].reason).toContain("送金が有効になっていません");
    });

    it("Stripe Connectアカウントが設定されていない場合は対象外とする", async () => {
      const mockEvents: EligibleEvent[] = [
        {
          id: "event-1",
          title: "テストイベント1",
          date: "2025-01-01",
          fee: 1000,
          created_by: "user-1",
          created_at: "2025-01-01T00:00:00Z",
          paid_attendances_count: 5,
          total_stripe_sales: 5000,
        },
      ];

      mockPayoutService.findEligibleEvents!.mockResolvedValue(mockEvents);
      mockStripeConnectService.getConnectAccountByUser!.mockResolvedValue(null);

      const result = await scheduler.findEligibleEventsWithDetails();

      expect(result.eligible).toHaveLength(0);
      expect(result.ineligible).toHaveLength(1);
      expect(result.ineligible[0].reason).toBe("Stripe Connectアカウントが設定されていません");
    });
  });

  describe("executeScheduledPayouts", () => {
    it("ドライランモードで実行する", async () => {
      const mockEvents: EligibleEvent[] = [
        {
          id: "event-1",
          title: "テストイベント1",
          date: "2025-01-01",
          fee: 1000,
          created_by: "user-1",
          created_at: "2025-01-01T00:00:00Z",
          paid_attendances_count: 5,
          total_stripe_sales: 5000,
          estimated_payout_amount: 4820,
        },
      ];

      // findEligibleEventsWithDetailsをモック
      jest.spyOn(scheduler, "findEligibleEventsWithDetails").mockResolvedValue({
        eligible: mockEvents,
        ineligible: [],
        summary: {
          totalEvents: 1,
          eligibleCount: 1,
          ineligibleCount: 0,
          totalEligibleAmount: 4820,
        },
      });

      // ログ記録をモック
      jest.spyOn(scheduler, "logSchedulerExecution").mockResolvedValue();

      const result = await scheduler.executeScheduledPayouts({ dryRun: true });

      expect(result.dryRun).toBe(true);
      expect(result.eligibleEventsCount).toBe(1);
      expect(result.successfulPayouts).toBe(0);
      expect(result.failedPayouts).toBe(0);
      expect(result.totalAmount).toBe(4820);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].dryRun).toBe(true);
      expect(mockPayoutService.processPayout).not.toHaveBeenCalled();
    });

    it("実際の送金処理を実行する", async () => {
      const mockEvents: EligibleEvent[] = [
        {
          id: "event-1",
          title: "テストイベント1",
          date: "2025-01-01",
          fee: 1000,
          created_by: "user-1",
          created_at: "2025-01-01T00:00:00Z",
          paid_attendances_count: 5,
          total_stripe_sales: 5000,
          estimated_payout_amount: 4820,
        },
      ];

      jest.spyOn(scheduler, "findEligibleEventsWithDetails").mockResolvedValue({
        eligible: mockEvents,
        ineligible: [],
        summary: {
          totalEvents: 1,
          eligibleCount: 1,
          ineligibleCount: 0,
          totalEligibleAmount: 4820,
        },
      });

      mockPayoutService.processPayout!.mockResolvedValue({
        payoutId: "payout-1",
        transferId: "tr_1",
        netAmount: 4820,
        estimatedArrival: "2025-01-10T00:00:00Z",
      });

      jest.spyOn(scheduler, "logSchedulerExecution").mockResolvedValue();

      const result = await scheduler.executeScheduledPayouts({ dryRun: false });

      expect(result.dryRun).toBe(false);
      expect(result.successfulPayouts).toBe(1);
      expect(result.failedPayouts).toBe(0);
      expect(result.totalAmount).toBe(4820);
      expect(result.results[0].success).toBe(true);
      expect(result.results[0].payoutId).toBe("payout-1");
      expect(mockPayoutService.processPayout).toHaveBeenCalledWith({
        eventId: "event-1",
        userId: "user-1",
        notes: expect.stringContaining("Automated payout via scheduler"),
      });
    });

    it("送金処理でエラーが発生した場合は失敗として記録する", async () => {
      const mockEvents: EligibleEvent[] = [
        {
          id: "event-1",
          title: "テストイベント1",
          date: "2025-01-01",
          fee: 1000,
          created_by: "user-1",
          created_at: "2025-01-01T00:00:00Z",
          paid_attendances_count: 5,
          total_stripe_sales: 5000,
          estimated_payout_amount: 4820,
        },
      ];

      jest.spyOn(scheduler, "findEligibleEventsWithDetails").mockResolvedValue({
        eligible: mockEvents,
        ineligible: [],
        summary: {
          totalEvents: 1,
          eligibleCount: 1,
          ineligibleCount: 0,
          totalEligibleAmount: 4820,
        },
      });

      mockPayoutService.processPayout!.mockRejectedValue(new Error("送金処理に失敗しました"));
      jest.spyOn(scheduler, "logSchedulerExecution").mockResolvedValue();

      const result = await scheduler.executeScheduledPayouts({ dryRun: false });

      expect(result.successfulPayouts).toBe(0);
      expect(result.failedPayouts).toBe(1);
      expect(result.totalAmount).toBe(0);
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toBe("送金処理に失敗しました");
    });

    it("対象イベントがない場合は何も処理しない", async () => {
      jest.spyOn(scheduler, "findEligibleEventsWithDetails").mockResolvedValue({
        eligible: [],
        ineligible: [],
        summary: {
          totalEvents: 0,
          eligibleCount: 0,
          ineligibleCount: 0,
          totalEligibleAmount: 0,
        },
      });

      jest.spyOn(scheduler, "logSchedulerExecution").mockResolvedValue();

      const result = await scheduler.executeScheduledPayouts();

      expect(result.eligibleEventsCount).toBe(0);
      expect(result.successfulPayouts).toBe(0);
      expect(result.failedPayouts).toBe(0);
      expect(result.results).toHaveLength(0);
      expect(mockPayoutService.processPayout).not.toHaveBeenCalled();
    });
  });

  describe("logSchedulerExecution", () => {
    it("実行ログを正しく記録する", async () => {
      const mockResult: SchedulerExecutionResult = {
        executionId: "test-execution-1",
        startTime: new Date("2025-01-01T10:00:00Z"),
        endTime: new Date("2025-01-01T10:05:00Z"),
        eligibleEventsCount: 2,
        successfulPayouts: 1,
        failedPayouts: 1,
        totalAmount: 5000,
        results: [
          {
            eventId: "event-1",
            eventTitle: "成功イベント",
            userId: "user-1",
            success: true,
            payoutId: "payout-1",
            amount: 5000,
          },
          {
            eventId: "event-2",
            eventTitle: "失敗イベント",
            userId: "user-2",
            success: false,
            error: "送金処理に失敗しました",
          },
        ],
        dryRun: false,
      };

      const mockInsert = jest.fn().mockResolvedValue({ error: null });
      mockSupabase.from.mockReturnValue({ insert: mockInsert });

      // ensureLogTableExistsをモック
      jest.spyOn(scheduler as any, "ensureLogTableExists").mockResolvedValue();

      await scheduler.logSchedulerExecution(mockResult);

      expect(mockSupabase.from).toHaveBeenCalledWith("payout_scheduler_logs");
      expect(mockInsert).toHaveBeenCalledWith({
        execution_id: "test-execution-1",
        start_time: "2025-01-01T10:00:00.000Z",
        end_time: "2025-01-01T10:05:00.000Z",
        processing_time_ms: 300000,
        eligible_events_count: 2,
        successful_payouts: 1,
        failed_payouts: 1,
        total_amount: 5000,
        dry_run: false,
        error_message: null,
        results: mockResult.results,
        summary: null,
      });
    });

    it("ログ記録に失敗してもエラーをスローしない", async () => {
      const mockResult: SchedulerExecutionResult = {
        executionId: "test-execution-1",
        startTime: new Date(),
        endTime: new Date(),
        eligibleEventsCount: 0,
        successfulPayouts: 0,
        failedPayouts: 0,
        totalAmount: 0,
        results: [],
        dryRun: false,
      };

      const mockInsert = jest.fn().mockResolvedValue({
        error: { message: "Database error" }
      });
      mockSupabase.from.mockReturnValue({ insert: mockInsert });
      jest.spyOn(scheduler as any, "ensureLogTableExists").mockResolvedValue();

      // エラーをスローしないことを確認
      await expect(scheduler.logSchedulerExecution(mockResult)).resolves.not.toThrow();
    });
  });

  describe("getExecutionHistory", () => {
    it("実行履歴を正しく取得する", async () => {
      const mockLogs: PayoutSchedulerLog[] = [
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
          end_time: "2025-01-02T10:02:00Z",
          processing_time_ms: 120000,
          eligible_events_count: 1,
          successful_payouts: 0,
          failed_payouts: 1,
          total_amount: 0,
          dry_run: false,
          error_message: "処理中にエラーが発生しました",
          results: [],
          summary: null,
          created_at: "2025-01-02T10:02:00Z",
        },
      ];

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockResolvedValue({
          data: mockLogs,
          error: null,
          count: 2,
        }),
      };

      mockSupabase.from.mockReturnValue(mockQuery);

      const result = await scheduler.getExecutionHistory({ limit: 10 });

      expect(result.logs).toEqual(mockLogs);
      expect(result.total).toBe(2);
      expect(result.summary.totalExecutions).toBe(2);
      expect(result.summary.successfulExecutions).toBe(1);
      expect(result.summary.failedExecutions).toBe(1);
      expect(result.summary.totalPayoutsProcessed).toBe(2);
      expect(result.summary.totalAmountProcessed).toBe(10000);
    });
  });

  describe("cleanupOldLogs", () => {
    it("古いログを正しく削除する", async () => {
      const mockDelete = jest.fn().mockReturnValue({
        lt: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue({
            data: [{ id: "log-1" }, { id: "log-2" }],
            error: null,
          }),
        }),
      });

      mockSupabase.from.mockReturnValue({ delete: mockDelete });

      const result = await scheduler.cleanupOldLogs();

      expect(result.deletedCount).toBe(2);
      expect(mockSupabase.from).toHaveBeenCalledWith("payout_scheduler_logs");
    });
  });

  describe("設定管理", () => {
    it("設定を正しく更新する", () => {
      const newConfig: Partial<PayoutSchedulerConfig> = {
        daysAfterEvent: 7,
        minimumAmount: 200,
      };

      scheduler.updateConfig(newConfig);
      const config = scheduler.getConfig();

      expect(config.daysAfterEvent).toBe(7);
      expect(config.minimumAmount).toBe(200);
      expect(config.maxEventsPerRun).toBe(100); // デフォルト値が保持される
    });

    it("現在の設定を取得する", () => {
      const config = scheduler.getConfig();

      expect(config).toHaveProperty("daysAfterEvent");
      expect(config).toHaveProperty("minimumAmount");
      expect(config).toHaveProperty("maxEventsPerRun");
      expect(config).toHaveProperty("enableLogging");
    });
  });
});
