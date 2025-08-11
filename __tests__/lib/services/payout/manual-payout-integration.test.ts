/**
 * 手動送金実行条件検証の統合テスト
 * タスク7.6.1の要件8.1-8.4の統合テスト
 */

import { PayoutValidator } from "@/lib/services/payout/validation";
import { PayoutService } from "@/lib/services/payout/service";
import { PayoutError, PayoutErrorType } from "@/lib/services/payout/types";

// 統合テスト用のモック設定
const mockSupabase = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn(),
  maybeSingle: jest.fn(),
};

const mockStripeConnectService = {
  getConnectAccountByUser: jest.fn(),
};

const mockErrorHandler = {
  handlePayoutError: jest.fn(),
  logError: jest.fn(),
};

const mockStripeTransferService = {
  createTransfer: jest.fn(),
  getTransfer: jest.fn(),
  cancelTransfer: jest.fn(),
};

// createClientのモック
jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => mockSupabase),
}));

describe("手動送金実行条件検証 - 統合テスト", () => {
  let validator: PayoutValidator;
  let payoutService: PayoutService;

  beforeEach(() => {
    validator = new PayoutValidator(
      "https://mock-url.supabase.co",
      "mock-key",
      mockStripeConnectService as any
    );

    payoutService = new PayoutService(
      "https://mock-url.supabase.co",
      "mock-key",
      mockErrorHandler as any,
      mockStripeConnectService as any,
      validator,
      mockStripeTransferService as any
    );

    jest.clearAllMocks();
  });

  describe("要件8.1: 自動送金の実行状況確認", () => {
    it("自動送金が失敗状態の場合、手動送金を許可する", async () => {
      // 過去のイベント設定
      const mockEvent = {
        id: "event-123",
        title: "テストイベント",
        date: "2024-01-01",
        created_by: "user-123",
        status: "past",
      };
      mockSupabase.single.mockResolvedValue({ data: mockEvent, error: null });

      // 失敗状態の送金レコード
      mockSupabase.maybeSingle.mockResolvedValue({
        data: {
          id: "payout-123",
          status: "failed",
          created_at: "2024-01-06T00:00:00Z",
          processed_at: null,
        },
        error: null,
      });

      // Stripe決済データのモック（JOINクエリ対応）
      const mockPaymentsQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
      };

      // 最後のeqメソッドの呼び出し結果をモック
      let eqCallCount = 0;
      mockPaymentsQuery.eq.mockImplementation((field: string, value: any) => {
        eqCallCount++;
        if (eqCallCount === 3) { // 3回目のeq呼び出し（status = "paid"）で結果を返す
          return Promise.resolve({
            data: [{ amount: 1000 }, { amount: 2000 }],
            error: null,
          });
        }
        return mockPaymentsQuery;
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "payments") {
          eqCallCount = 0; // リセット
          return mockPaymentsQuery;
        }
        return mockSupabase;
      });

      // Stripe Connectアカウント（正常状態）
      mockStripeConnectService.getConnectAccountByUser.mockResolvedValue({
        stripe_account_id: "acct_123",
        status: "verified",
        charges_enabled: true,
        payouts_enabled: true,
      });

      // 現在日時を設定（イベントから10日後）
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2024-01-11"));

      const result = await payoutService.validateManualPayoutEligibility({
        eventId: "event-123",
        userId: "user-123",
      });

      expect(result.eligible).toBe(true);
      expect(result.details.autoPayoutFailed).toBe(true);
      expect(result.details.duplicatePayoutExists).toBe(true);
      expect(result.details.existingPayoutStatus).toBe("failed");

      jest.useRealTimers();
    });

    it("自動送金が予定日を過ぎてもpending状態の場合、手動送金を許可する", async () => {
      const mockEvent = {
        id: "event-123",
        title: "テストイベント",
        date: "2024-01-01",
        created_by: "user-123",
        status: "past",
      };
      mockSupabase.single.mockResolvedValue({ data: mockEvent, error: null });

      // pending状態で予定日を過ぎた送金レコード
      mockSupabase.maybeSingle.mockResolvedValue({
        data: {
          id: "payout-123",
          status: "pending",
          created_at: "2024-01-06T00:00:00Z", // 予定日（イベント+5日）を過ぎている
          processed_at: null,
        },
        error: null,
      });

      // Stripe決済データのモック（JOINクエリ対応）
      const mockPaymentsQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
      };

      let eqCallCount = 0;
      mockPaymentsQuery.eq.mockImplementation((field: string, value: any) => {
        eqCallCount++;
        if (eqCallCount === 3) {
          return Promise.resolve({
            data: [{ amount: 1500 }],
            error: null,
          });
        }
        return mockPaymentsQuery;
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "payments") {
          eqCallCount = 0;
          return mockPaymentsQuery;
        }
        return mockSupabase;
      });

      mockStripeConnectService.getConnectAccountByUser.mockResolvedValue({
        stripe_account_id: "acct_123",
        status: "verified",
        charges_enabled: true,
        payouts_enabled: true,
      });

      // 現在日時を設定（イベントから10日後、予定日から4日後）
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2024-01-11"));

      const result = await payoutService.validateManualPayoutEligibility({
        eventId: "event-123",
        userId: "user-123",
      });

      expect(result.eligible).toBe(true);
      expect(result.details.autoPayoutOverdue).toBe(true);
      expect(result.details.duplicatePayoutExists).toBe(true);
      expect(result.details.existingPayoutStatus).toBe("pending");

      jest.useRealTimers();
    });
  });

  describe("要件8.2: Stripe Connectアカウント状態の検証", () => {
    it("Stripe Connectアカウントが未認証の場合、手動送金を拒否する", async () => {
      const mockEvent = {
        id: "event-123",
        title: "テストイベント",
        date: "2024-01-01",
        created_by: "user-123",
        status: "past",
      };
      mockSupabase.single.mockResolvedValue({ data: mockEvent, error: null });
      mockSupabase.maybeSingle.mockResolvedValue({ data: null, error: null });

      // 未認証のStripe Connectアカウント
      mockStripeConnectService.getConnectAccountByUser.mockResolvedValue({
        stripe_account_id: "acct_123",
        status: "pending", // 未認証
        charges_enabled: false,
        payouts_enabled: false,
      });

      jest.useFakeTimers();
      jest.setSystemTime(new Date("2024-01-11"));

      const result = await payoutService.validateManualPayoutEligibility({
        eventId: "event-123",
        userId: "user-123",
      });

      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain("Stripe Connectアカウントの認証が完了していません");
      expect(result.details.stripeAccountReady).toBe(false);
      expect(result.details.payoutsEnabled).toBe(false);

      jest.useRealTimers();
    });
  });

  describe("要件8.3: 送金対象金額の検証", () => {
    it("送金金額が最小金額（100円）を下回る場合、手動送金を拒否する", async () => {
      const mockEvent = {
        id: "event-123",
        title: "テストイベント",
        date: "2024-01-01",
        created_by: "user-123",
        status: "past",
      };
      mockSupabase.single.mockResolvedValue({ data: mockEvent, error: null });
      mockSupabase.maybeSingle.mockResolvedValue({ data: null, error: null });

      // 少額の決済データ（手数料を引くと100円未満になる）
      const mockPaymentsQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
      };

      let eqCallCount = 0;
      mockPaymentsQuery.eq.mockImplementation((field: string, value: any) => {
        eqCallCount++;
        if (eqCallCount === 3) {
          return Promise.resolve({
            data: [{ amount: 50 }], // 50円の決済
            error: null,
          });
        }
        return mockPaymentsQuery;
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "payments") {
          eqCallCount = 0;
          return mockPaymentsQuery;
        }
        return mockSupabase;
      });

      mockStripeConnectService.getConnectAccountByUser.mockResolvedValue({
        stripe_account_id: "acct_123",
        status: "verified",
        charges_enabled: true,
        payouts_enabled: true,
      });

      jest.useFakeTimers();
      jest.setSystemTime(new Date("2024-01-11"));

      const result = await payoutService.validateManualPayoutEligibility({
        eventId: "event-123",
        userId: "user-123",
        minimumAmount: 100,
      });

      expect(result.eligible).toBe(false);
      expect(result.reasons.some(reason => reason.includes("送金金額が最小金額（100円）を下回っています"))).toBe(true);
      expect(result.details.minimumAmountMet).toBe(false);
      expect(result.details.estimatedAmount).toBeLessThan(100);

      jest.useRealTimers();
    });
  });

  describe("要件8.4: イベント終了5日経過の検証", () => {
    it("イベント終了から5日経過していない場合、手動送金を拒否する", async () => {
      const mockEvent = {
        id: "event-123",
        title: "テストイベント",
        date: "2024-01-01",
        created_by: "user-123",
        status: "past",
      };
      mockSupabase.single.mockResolvedValue({ data: mockEvent, error: null });

      // 現在日時を設定（イベントから3日後）
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2024-01-04"));

      const result = await payoutService.validateManualPayoutEligibility({
        eventId: "event-123",
        userId: "user-123",
        daysAfterEvent: 5,
      });

      expect(result.eligible).toBe(false);
      expect(result.reasons).toContain("イベント終了から5日経過していません。あと2日お待ちください。");
      expect(result.details.eventEndedCheck).toBe(false);
      expect(result.details.eventEndedDaysAgo).toBe(3);

      jest.useRealTimers();
    });
  });

  describe("複合条件のテスト", () => {
    it("すべての条件を満たす場合、手動送金を許可する", async () => {
      const mockEvent = {
        id: "event-123",
        title: "テストイベント",
        date: "2024-01-01",
        created_by: "user-123",
        status: "past",
      };
      mockSupabase.single.mockResolvedValue({ data: mockEvent, error: null });
      mockSupabase.maybeSingle.mockResolvedValue({ data: null, error: null }); // 既存送金なし

      // 十分な金額の決済データ
      const mockPaymentsQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
      };

      let eqCallCount = 0;
      mockPaymentsQuery.eq.mockImplementation((field: string, value: any) => {
        eqCallCount++;
        if (eqCallCount === 3) {
          return Promise.resolve({
            data: [{ amount: 1000 }, { amount: 2000 }], // 合計3000円
            error: null,
          });
        }
        return mockPaymentsQuery;
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "payments") {
          eqCallCount = 0;
          return mockPaymentsQuery;
        }
        return mockSupabase;
      });

      // 正常なStripe Connectアカウント
      mockStripeConnectService.getConnectAccountByUser.mockResolvedValue({
        stripe_account_id: "acct_123",
        status: "verified",
        charges_enabled: true,
        payouts_enabled: true,
      });

      // 現在日時を設定（イベントから10日後）
      jest.useFakeTimers();
      jest.setSystemTime(new Date("2024-01-11"));

      const result = await payoutService.validateManualPayoutEligibility({
        eventId: "event-123",
        userId: "user-123",
      });

      expect(result.eligible).toBe(true);
      expect(result.reasons).toHaveLength(0);
      expect(result.details.eventEndedCheck).toBe(true);
      expect(result.details.stripeAccountReady).toBe(true);
      expect(result.details.payoutsEnabled).toBe(true);
      expect(result.details.minimumAmountMet).toBe(true);
      expect(result.details.duplicatePayoutExists).toBe(false);

      jest.useRealTimers();
    });
  });
});
