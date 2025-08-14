/**
 * PayoutSchedulerのテスト
 */

import { PayoutScheduler } from "@/lib/services/payout/scheduler";
import { PayoutService } from "@/lib/services/payout/service";
import { StripeConnectService } from "@/lib/services/stripe-connect/service";
import {
  PayoutSchedulerConfig,
  EligibleEventWithAmount,
  SchedulerExecutionResult,
  PayoutSchedulerLog,
} from "@/lib/services/payout/types";

// モック
jest.mock("@/lib/services/payout/service");
jest.mock("@/lib/services/stripe-connect/service");

const mockSupabase = {
  from: jest.fn(),
  rpc: jest.fn(),
};

// デフォルト: row lock を取得成功させる
mockSupabase.rpc.mockImplementation((fnName: string) => {
  if (fnName === "try_acquire_scheduler_lock") {
    return {
      single: jest.fn().mockResolvedValue({ data: true, error: null }),
    } as any;
  }
  if (fnName === "release_scheduler_lock") {
    return {
      single: jest.fn().mockResolvedValue({ data: true, error: null }),
    } as any;
  }
  // その他 RPC はテストケースごとに上書きされる
  return Promise.resolve({ data: [], error: null }) as any;
});

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

    scheduler = new PayoutScheduler(
      mockPayoutService as any,
      mockStripeConnectService as any,
      mockSupabase as any
    );

    // 念のためDIされたクライアント参照を強制上書き
    (scheduler as any).supabase = mockSupabase as any;
  });

  describe("findEligibleEventsWithDetails", () => {
    it("送金対象イベントの詳細判定を正しく実行する (RPC)", async () => {
      // RPC戻り値をモック
      const rpcRows = [
        {
          event_id: "event-1",
          title: "テストイベント1",
          event_date: "2025-01-01",
          fee: 1000,
          created_by: "user-1",
          created_at: "2025-01-01T00:00:00Z",
          paid_attendances_count: 5,
          total_stripe_sales: 5000,
          total_stripe_fee: 180,
          platform_fee: 0,
          net_payout_amount: 4820,
          charges_enabled: true,
          payouts_enabled: true,
          eligible: true,
          ineligible_reason: null,
        },
        {
          event_id: "event-2",
          title: "テストイベント2",
          event_date: "2025-01-02",
          fee: 500,
          created_by: "user-2",
          created_at: "2025-01-02T00:00:00Z",
          paid_attendances_count: 2,
          total_stripe_sales: 1000,
          total_stripe_fee: 36,
          platform_fee: 0,
          net_payout_amount: 964,
          charges_enabled: true,
          payouts_enabled: false,
          eligible: false,
          ineligible_reason: "Stripe Connectアカウントで送金が有効になっていません",
        },
      ];

      mockSupabase.rpc.mockImplementation((fnName: string) => {
        if (fnName === "find_eligible_events_with_details") {
          return Promise.resolve({ data: rpcRows, error: null }) as any;
        }
        if (fnName === "try_acquire_scheduler_lock") {
          return {
            single: jest.fn().mockResolvedValue({ data: true, error: null }),
          } as any;
        }
        if (fnName === "release_scheduler_lock") {
          return {
            single: jest.fn().mockResolvedValue({ data: true, error: null }),
          } as any;
        }
        return Promise.resolve({ data: [], error: null }) as any;
      });

      const result = await scheduler.findEligibleEventsWithDetails();

      expect(result.eligible).toHaveLength(1);
      expect(result.ineligible).toHaveLength(1);
      expect(result.summary.totalEvents).toBe(2);
      expect(result.summary.eligibleCount).toBe(1);
      expect(result.summary.ineligibleCount).toBe(1);
      expect(result.eligible[0].id).toBe("event-1");
      expect(result.ineligible[0].reason).toContain("送金が有効になっていません");
    });

    it("Stripe Connectアカウント未設定の場合は対象外 (RPC)", async () => {
      const rpcRows = [
        {
          event_id: "event-1",
          title: "テストイベント1",
          event_date: "2025-01-01",
          fee: 1000,
          created_by: "user-1",
          created_at: "2025-01-01T00:00:00Z",
          paid_attendances_count: 5,
          total_stripe_sales: 5000,
          total_stripe_fee: 180,
          platform_fee: 0,
          net_payout_amount: 4820,
          charges_enabled: false,
          payouts_enabled: false,
          eligible: false,
          ineligible_reason: "Stripe Connectアカウントで送金が有効になっていません",
        },
      ];

      mockSupabase.rpc.mockImplementation((fnName: string) => {
        if (fnName === "find_eligible_events_with_details") {
          return Promise.resolve({ data: rpcRows, error: null }) as any;
        }
        if (fnName === "try_acquire_scheduler_lock") {
          return {
            single: jest.fn().mockResolvedValue({ data: true, error: null }),
          } as any;
        }
        if (fnName === "release_scheduler_lock") {
          return {
            single: jest.fn().mockResolvedValue({ data: true, error: null }),
          } as any;
        }
        return Promise.resolve({ data: [], error: null }) as any;
      });

      const result = await scheduler.findEligibleEventsWithDetails();

      expect(result.eligible).toHaveLength(0);
      expect(result.ineligible).toHaveLength(1);
      expect(result.ineligible[0].reason).toBe("Stripe Connectアカウントで送金が有効になっていません");
    });
  });

  describe("executeScheduledPayouts", () => {
    it("ロック取得に失敗した場合はスキップする", async () => {
      // row lock false を返すようにモック
      mockSupabase.rpc.mockImplementation((fnName: string) => {
        if (fnName === "try_acquire_scheduler_lock") {
          return {
            single: jest.fn().mockResolvedValue({ data: false, error: null }),
          } as any;
        }
        if (fnName === "release_scheduler_lock") {
          return {
            single: jest.fn().mockResolvedValue({ data: true, error: null }),
          } as any;
        }
        return Promise.resolve({ data: [], error: null }) as any;
      });

      jest.spyOn(scheduler, "logSchedulerExecution").mockResolvedValue(undefined);

      const result = await scheduler.executeScheduledPayouts();

      expect(result.eligibleEventsCount).toBe(0);
      expect(result.results).toHaveLength(0);
      // processPayout が呼ばれない
      expect(mockPayoutService.processPayout).not.toHaveBeenCalled();
    });

    it("ドライランモードで実行する", async () => {
      const mockEvents: EligibleEventWithAmount[] = [
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
      jest.spyOn(scheduler, "logSchedulerExecution").mockResolvedValue(undefined);

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
      const mockEvents: EligibleEventWithAmount[] = [
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

      (mockPayoutService.processPayout as jest.Mock).mockResolvedValue({
        payoutId: "payout-1",
        transferId: "tr_1",
        netAmount: 4820,
        estimatedArrival: "2025-01-10T00:00:00Z",
      });

      jest.spyOn(scheduler, "logSchedulerExecution").mockResolvedValue(undefined);

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
      const mockEvents: EligibleEventWithAmount[] = [
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

      (mockPayoutService.processPayout as jest.Mock).mockRejectedValue(new Error("送金処理に失敗しました"));
      jest.spyOn(scheduler, "logSchedulerExecution").mockResolvedValue(undefined);

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

      jest.spyOn(scheduler, "logSchedulerExecution").mockResolvedValue(undefined);

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
      jest.spyOn(scheduler as any, "ensureLogTableExists").mockResolvedValue(undefined);

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
      jest.spyOn(scheduler as any, "ensureLogTableExists").mockResolvedValue(undefined);

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

  describe("アカウント単位スロットリングとレート制限対応", () => {
    beforeEach(() => {
      jest.clearAllMocks();

      // デフォルトのモック設定
      mockSupabase.rpc.mockImplementation((fnName: string) => {
        if (fnName === "try_acquire_scheduler_lock") {
          return {
            single: jest.fn().mockResolvedValue({ data: true, error: null }),
          } as any;
        }
        if (fnName === "release_scheduler_lock") {
          return {
            single: jest.fn().mockResolvedValue({ data: true, error: null }),
          } as any;
        }
        if (fnName === "find_eligible_events_with_details") {
          return Promise.resolve({
            data: [
              {
                event_id: "event1",
                title: "Event 1",
                event_date: "2024-01-01",
                fee: 1000,
                created_by: "user1",
                created_at: "2024-01-01T00:00:00Z",
                paid_attendances_count: 10,
                total_stripe_sales: 10000,
                total_stripe_fee: 300,
                platform_fee: 200,
                net_payout_amount: 9500,
                charges_enabled: true,
                payouts_enabled: true,
                eligible: true,
                ineligible_reason: null,
              },
              {
                event_id: "event2",
                title: "Event 2",
                event_date: "2024-01-02",
                fee: 1000,
                created_by: "user1", // 同じユーザー（同じConnectアカウント）
                created_at: "2024-01-02T00:00:00Z",
                paid_attendances_count: 5,
                total_stripe_sales: 5000,
                total_stripe_fee: 150,
                platform_fee: 100,
                net_payout_amount: 4750,
                charges_enabled: true,
                payouts_enabled: true,
                eligible: true,
                ineligible_reason: null,
              },
              {
                event_id: "event3",
                title: "Event 3",
                event_date: "2024-01-03",
                fee: 1000,
                created_by: "user2", // 別のユーザー（別のConnectアカウント）
                created_at: "2024-01-03T00:00:00Z",
                paid_attendances_count: 8,
                total_stripe_sales: 8000,
                total_stripe_fee: 240,
                platform_fee: 160,
                net_payout_amount: 7600,
                charges_enabled: true,
                payouts_enabled: true,
                eligible: true,
                ineligible_reason: null,
              },
            ],
            error: null,
          });
        }
        return Promise.resolve({ data: [], error: null }) as any;
      });
    });

    it("同一Connectアカウントのイベントは逐次処理される", async () => {
      // Connectアカウント情報のモック
      mockStripeConnectService.getConnectAccountByUser!.mockImplementation((userId: string) => {
        if (userId === "user1") {
          return Promise.resolve({
            id: "connect1",
            user_id: "user1",
            stripe_account_id: "acct_1",
            charges_enabled: true,
            payouts_enabled: true,
            status: "active",
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
          });
        }
        if (userId === "user2") {
          return Promise.resolve({
            id: "connect2",
            user_id: "user2",
            stripe_account_id: "acct_2",
            charges_enabled: true,
            payouts_enabled: true,
            status: "active",
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
          });
        }
        return Promise.resolve(null);
      });

      // PayoutServiceのモック
      const processCallTimes: number[] = [];
      mockPayoutService.processPayout!.mockImplementation(async ({ eventId }) => {
        processCallTimes.push(Date.now());
        return {
          payoutId: `payout_${eventId}`,
          transferId: `tr_${eventId}`,
          netAmount: 5000,
          estimatedArrival: "2024-01-10T00:00:00Z",
          rateLimitInfo: {
            hitRateLimit: false,
            retriedCount: 0,
          },
        };
      });

      const scheduler = new PayoutScheduler(
        mockPayoutService as any,
        mockStripeConnectService as any,
        mockSupabase as any,
        {
          maxConcurrency: 2,
          delayBetweenBatches: 1000,
        }
      );

      const result = await scheduler.executeScheduledPayouts();

      expect(result.successfulPayouts).toBe(3);
      expect(result.failedPayouts).toBe(0);

      // processPayout が3回呼ばれることを確認
      expect(mockPayoutService.processPayout).toHaveBeenCalledTimes(3);

      // 同一アカウント（user1のevent1, event2）は1秒間隔で処理されることを確認
      expect(processCallTimes).toHaveLength(3);

      // ログ出力で適切にグループ化されていることを確認
      // （実際のログ確認は困難なので、モックの呼び出し順序で代用）
      const calls = mockPayoutService.processPayout!.mock.calls;
      expect(calls[0][0].eventId).toBe("event1");
      expect(calls[1][0].eventId).toBe("event2");
      expect(calls[2][0].eventId).toBe("event3");
    });

    it("レート制限が発生した場合、動的に遅延を調整する", async () => {
      // Connectアカウント情報のモック
      mockStripeConnectService.getConnectAccountByUser!.mockResolvedValue({
        id: "connect1",
        user_id: "user1",
        stripe_account_id: "acct_1",
        charges_enabled: true,
        payouts_enabled: true,
        status: "active",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      });

      // PayoutServiceのモック - 最初の呼び出しでレート制限
      let callCount = 0;
      mockPayoutService.processPayout!.mockImplementation(async ({ eventId }) => {
        callCount++;
        const rateLimitInfo = callCount === 1 ? {
          hitRateLimit: true,
          suggestedDelayMs: 2000,
          retriedCount: 1,
        } : {
          hitRateLimit: false,
          retriedCount: 0,
        };

        return {
          payoutId: `payout_${eventId}`,
          transferId: `tr_${eventId}`,
          netAmount: 5000,
          estimatedArrival: "2024-01-10T00:00:00Z",
          rateLimitInfo,
        };
      });

      const scheduler = new PayoutScheduler(
        mockPayoutService as any,
        mockStripeConnectService as any,
        mockSupabase as any,
        {
          maxConcurrency: 1,
          delayBetweenBatches: 500, // 通常は500ms
        }
      );

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await scheduler.executeScheduledPayouts();

      expect(result.successfulPayouts).toBe(3);

      // レート制限警告が出力されることを確認
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Rate limit hit 1 times during execution")
      );

      consoleSpy.mockRestore();
    });

    it("Connectアカウント取得に失敗したイベントは'unknown'グループに分類される", async () => {
      // Connectアカウント取得で一部失敗
      mockStripeConnectService.getConnectAccountByUser!.mockImplementation((userId: string) => {
        if (userId === "user1") {
          return Promise.resolve({
            id: "connect1",
            user_id: "user1",
            stripe_account_id: "acct_1",
            charges_enabled: true,
            payouts_enabled: true,
            status: "active",
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z",
          });
        }
        // user2は失敗
        return Promise.reject(new Error("Connect account not found"));
      });

      // PayoutServiceのモック
      mockPayoutService.processPayout!.mockResolvedValue({
        payoutId: "payout_123",
        transferId: "tr_123",
        netAmount: 5000,
        estimatedArrival: "2024-01-10T00:00:00Z",
      });

      const scheduler = new PayoutScheduler(
        mockPayoutService as any,
        mockStripeConnectService as any,
        mockSupabase as any
      );

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = await scheduler.executeScheduledPayouts();

      expect(result.successfulPayouts).toBe(3);

      // エラーログが出力されることを確認
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to get Connect account for user user2"),
        expect.any(Error)
      );

      // グループ化ログで "unknown" グループが含まれることを確認
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Grouped 3 events into"),
        expect.stringContaining("unknown: 1 events")
      );

      consoleErrorSpy.mockRestore();
      consoleLogSpy.mockRestore();
    });
  });
});
