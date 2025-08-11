/**
 * 手動送金実行条件検証ロジックのテスト
 * タスク7.6.1の要件8.1-8.4をテスト
 */
import { PayoutValidator } from "@/lib/services/payout/validation";
import { PayoutError, PayoutErrorType, ValidateManualPayoutParams, ManualPayoutEligibilityResult } from "@/lib/services/payout/types";
import { createClient } from "@supabase/supabase-js";

// モック設定
jest.mock("@supabase/supabase-js");
const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

// StripeConnectServiceのモック
const mockStripeConnectService = {
  getConnectAccountByUser: jest.fn(),
};

describe("PayoutValidator - 手動送金実行条件検証", () => {
  let validator: PayoutValidator;
  let mockSupabase: any;

  beforeEach(() => {
    // Supabaseクライアントのモック
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
      maybeSingle: jest.fn(),
    };

    mockCreateClient.mockReturnValue(mockSupabase);

    validator = new PayoutValidator(
      "mock-url",
      "mock-key",
      mockStripeConnectService as any
    );

    // モックのリセット
    jest.clearAllMocks();
  });

  describe("validateManualPayoutEligibility", () => {
    const baseParams: ValidateManualPayoutParams = {
      eventId: "event-123",
      userId: "user-123",
      minimumAmount: 100,
      daysAfterEvent: 5,
    };

    const mockEvent = {
      id: "event-123",
      title: "テストイベント",
      date: "2024-01-01", // 過去の日付
      created_by: "user-123",
      status: "past",
    };

    const mockStripePayments = [
      { amount: 1000 },
      { amount: 2000 },
    ];

    beforeEach(() => {
      // デフォルトのモック設定
      mockSupabase.single.mockResolvedValue({ data: mockEvent, error: null });
      mockSupabase.maybeSingle.mockResolvedValue({ data: null, error: null }); // 既存送金なし

      // Stripe決済データのモック
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "payments") {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            then: jest.fn().mockResolvedValue({ data: mockStripePayments, error: null }),
          };
        }
        return mockSupabase;
      });

      // paymentsテーブルのクエリ結果を直接モック
      const mockPaymentsQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
      };
      mockPaymentsQuery.eq.mockResolvedValue({ data: mockStripePayments, error: null });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "payments") {
          return mockPaymentsQuery;
        }
        return mockSupabase;
      });

      // Stripe Connectアカウントのモック（正常状態）
      mockStripeConnectService.getConnectAccountByUser.mockResolvedValue({
        stripe_account_id: "acct_123",
        status: "verified",
        charges_enabled: true,
        payouts_enabled: true,
      });
    });

    it("すべての条件を満たす場合、手動送金が可能と判定される", async () => {
      // 現在日時を2024-01-10に設定（イベントから9日後）
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2024-01-10"));

      const result = await validator.validateManualPayoutEligibility(baseParams);

      expect(result.eligible).toBe(true);
      expect(result.reasons).toHaveLength(0);
      expect(result.details.eventEndedCheck).toBe(true);
      expect(result.details.eventEndedDaysAgo).toBe(9);
      expect(result.details.stripeAccountReady).toBe(true);
      expect(result.details.payoutsEnabled).toBe(true);
      expect(result.details.minimumAmountMet).toBe(true);
      expect(result.details.duplicatePayoutExists).toBe(false);

      jest.useRealTimers();
    });

    it("イベント終了から5日経過していない場合、手動送金が不可と判定される", async () => {
      // 現在日時を2024-01-03に設定（イベントから2日後）
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2024-01-03"));

      const result = await validator.validateManualPayoutEligibility(baseParams);

      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain("イベント終了から5日経過していません。あと3日お待ちください。");
      expect(result.details.eventEndedCheck).toBe(false);
      expect(result.details.eventEndedDaysAgo).toBe(2);

      jest.useRealTimers();
    });

    it("Stripe Connectアカウントが未設定の場合、手動送金が不可と判定される", async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2024-01-10"));

      mockStripeConnectService.getConnectAccountByUser.mockResolvedValue(null);

      const result = await validator.validateManualPayoutEligibility(baseParams);

      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain("Stripe Connectアカウントが設定されていません");
      expect(result.details.stripeAccountReady).toBe(false);

      jest.useRealTimers();
    });

    it("Stripe Connectアカウントが未認証の場合、手動送金が不可と判定される", async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2024-01-10"));

      mockStripeConnectService.getConnectAccountByUser.mockResolvedValue({
        stripe_account_id: "acct_123",
        status: "pending",
        charges_enabled: false,
        payouts_enabled: false,
      });

      const result = await validator.validateManualPayoutEligibility(baseParams);

      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain("Stripe Connectアカウントの認証が完了していません");
      expect(result.reasons).toContain("Stripe Connectアカウントで決済受取が有効になっていません");
      expect(result.reasons).toContain("Stripe Connectアカウントで送金が有効になっていません");
      expect(result.details.stripeAccountReady).toBe(false);
      expect(result.details.payoutsEnabled).toBe(false);

      jest.useRealTimers();
    });

    it("送金金額が最小金額を下回る場合、手動送金が不可と判定される", async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2024-01-10"));

      // 少額の決済データに変更
      const smallPayments = [{ amount: 50 }];
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "payments") {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            then: jest.fn().mockResolvedValue({ data: smallPayments, error: null }),
          };
        }
        return mockSupabase;
      });

      const result = await validator.validateManualPayoutEligibility(baseParams);

      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain("送金金額が最小金額（100円）を下回っています");
      expect(result.details.minimumAmountMet).toBe(false);
      expect(result.details.estimatedAmount).toBeLessThan(100);

      jest.useRealTimers();
    });

    it("Stripe決済がない場合、手動送金が不可と判定される", async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2024-01-10"));

      // 決済データなし
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "payments") {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            then: jest.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        return mockSupabase;
      });

      const result = await validator.validateManualPayoutEligibility(baseParams);

      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain("このイベントには送金対象となるStripe決済がありません");

      jest.useRealTimers();
    });

    it("送金処理が既に完了済みの場合、手動送金が不可と判定される", async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2024-01-10"));

      // 完了済み送金レコードのモック
      mockSupabase.maybeSingle.mockResolvedValue({
        data: {
          id: "payout-123",
          status: "completed",
          created_at: "2024-01-06T00:00:00Z",
          processed_at: "2024-01-06T12:00:00Z",
        },
        error: null,
      });

      const result = await validator.validateManualPayoutEligibility(baseParams);

      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain("このイベントの送金処理は既に完了済みです");
      expect(result.details.duplicatePayoutExists).toBe(true);
      expect(result.details.existingPayoutStatus).toBe("completed");

      jest.useRealTimers();
    });

    it("送金処理が実行中の場合、手動送金が不可と判定される", async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2024-01-10"));

      // 実行中送金レコードのモック
      mockSupabase.maybeSingle.mockResolvedValue({
        data: {
          id: "payout-123",
          status: "processing",
          created_at: "2024-01-06T00:00:00Z",
          processed_at: null,
        },
        error: null,
      });

      const result = await validator.validateManualPayoutEligibility(baseParams);

      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain("このイベントの送金処理は現在実行中です");
      expect(result.details.duplicatePayoutExists).toBe(true);
      expect(result.details.existingPayoutStatus).toBe("processing");

      jest.useRealTimers();
    });

    it("自動送金が失敗状態の場合、手動送金が可能と判定される", async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2024-01-10"));

      // 失敗状態の送金レコードのモック
      mockSupabase.maybeSingle.mockResolvedValue({
        data: {
          id: "payout-123",
          status: "failed",
          created_at: "2024-01-06T00:00:00Z",
          processed_at: null,
        },
        error: null,
      });

      const result = await validator.validateManualPayoutEligibility(baseParams);

      expect(result.eligible).toBe(true);
      expect(result.reasons).toHaveLength(0);
      expect(result.details.duplicatePayoutExists).toBe(true);
      expect(result.details.autoPayoutFailed).toBe(true);
      expect(result.details.existingPayoutStatus).toBe("failed");

      jest.useRealTimers();
    });

    it("自動送金が予定日を過ぎてもpending状態の場合、手動送金が可能と判定される", async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2024-01-10")); // イベントから9日後

      // pending状態で予定日を過ぎた送金レコードのモック
      mockSupabase.maybeSingle.mockResolvedValue({
        data: {
          id: "payout-123",
          status: "pending",
          created_at: "2024-01-06T00:00:00Z", // 予定日（イベント+5日）を過ぎている
          processed_at: null,
        },
        error: null,
      });

      const result = await validator.validateManualPayoutEligibility(baseParams);

      expect(result.eligible).toBe(true);
      expect(result.reasons).toHaveLength(0);
      expect(result.details.duplicatePayoutExists).toBe(true);
      expect(result.details.autoPayoutOverdue).toBe(true);
      expect(result.details.existingPayoutStatus).toBe("pending");

      jest.useRealTimers();
    });

    it("自動送金がpending状態で予定日前の場合、手動送金が不可と判定される", async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2024-01-05")); // イベントから4日後（予定日前）

      // pending状態の送金レコードのモック
      mockSupabase.maybeSingle.mockResolvedValue({
        data: {
          id: "payout-123",
          status: "pending",
          created_at: "2024-01-04T00:00:00Z",
          processed_at: null,
        },
        error: null,
      });

      const result = await validator.validateManualPayoutEligibility(baseParams);

      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain("自動送金の予定日がまだ到来していません");
      expect(result.details.duplicatePayoutExists).toBe(true);
      expect(result.details.autoPayoutOverdue).toBe(false);

      jest.useRealTimers();
    });

    it("イベントが見つからない場合、適切なエラーメッセージを返す", async () => {
      mockSupabase.single.mockResolvedValue({ data: null, error: { code: "PGRST116" } });

      const result = await validator.validateManualPayoutEligibility(baseParams);

      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain("イベントが見つからないか、アクセス権限がありません");
    });

    it("主催者以外のユーザーの場合、権限エラーを返す", async () => {
      const eventWithDifferentOwner = {
        ...mockEvent,
        created_by: "other-user-123",
      };
      mockSupabase.single.mockResolvedValue({ data: eventWithDifferentOwner, error: null });

      const result = await validator.validateManualPayoutEligibility(baseParams);

      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain("このイベントの送金処理を実行する権限がありません");
    });

    it("終了済みでないイベントの場合、対象外エラーを返す", async () => {
      const activeEvent = {
        ...mockEvent,
        status: "active",
      };
      mockSupabase.single.mockResolvedValue({ data: activeEvent, error: null });

      const result = await validator.validateManualPayoutEligibility(baseParams);

      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain("終了済みでないイベントは送金対象外です");
    });

    it("データベースエラーが発生した場合、PayoutErrorをスローする", async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: "Database connection failed", code: "CONNECTION_ERROR" }
      });

      await expect(validator.validateManualPayoutEligibility(baseParams))
        .rejects
        .toThrow(PayoutError);
    });
  });
});
