/**
 * PayoutService の単体テスト
 */

import { PayoutService, PayoutErrorHandler } from "@/lib/services/payout";
import { PayoutError, PayoutErrorType } from "@/lib/services/payout/types";
import { IStripeConnectService } from "@/lib/services/stripe-connect/interface";

// Supabaseクライアントのモック
const mockSupabase = {
  from: jest.fn(),
  rpc: jest.fn(),
};

// Stripeクライアントのモック
jest.mock("@/lib/stripe/client", () => ({
  stripe: {
    transfers: {
      create: jest.fn(),
      retrieve: jest.fn(),
      createReversal: jest.fn(),
    },
  },
}));

// StripeTransferServiceのモック
jest.mock("@/lib/services/payout/stripe-transfer", () => ({
  StripeTransferService: jest.fn().mockImplementation(() => ({
    createTransfer: jest.fn(),
    getTransfer: jest.fn(),
    cancelTransfer: jest.fn(),
  })),
}));

// StripeConnectServiceのモック
const mockStripeConnectService: jest.Mocked<IStripeConnectService> = {
  createExpressAccount: jest.fn(),
  createAccountLink: jest.fn(),
  getAccountInfo: jest.fn(),
  getConnectAccountByUser: jest.fn(),
  updateAccountStatus: jest.fn(),
  isChargesEnabled: jest.fn(),
  isPayoutsEnabled: jest.fn(),
  isAccountVerified: jest.fn(),
};

describe("PayoutService", () => {
  let payoutService: PayoutService;
  let errorHandler: PayoutErrorHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    errorHandler = new PayoutErrorHandler();
    payoutService = new PayoutService(
      "https://test.supabase.co",
      "test-key",
      errorHandler,
      mockStripeConnectService
    );

    // Supabaseクライアントのモックを設定
    (payoutService as any).supabase = mockSupabase;

    // デフォルトのモック設定をリセット
    mockSupabase.from.mockClear();
    mockSupabase.rpc = jest.fn();
  });

  describe("findEligibleEvents", () => {
    it("送金対象イベントを正しく検索できる", async () => {
      // モックデータの設定
      const mockEventsData = [
        {
          id: "event-1",
          title: "テストイベント1",
          date: "2024-01-01",
          fee: 1000,
          created_by: "user-1",
          created_at: "2024-01-01T00:00:00Z",
          attendances: [
            {
              id: "attendance-1",
              payments: [
                {
                  id: "payment-1",
                  method: "stripe",
                  status: "paid",
                  amount: 1000,
                },
              ],
            },
          ],
        },
      ];

      const mockEventsQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
      };

      const mockPayoutsQuery = {
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
      };

      // 最初の呼び出し（イベント検索）
      mockSupabase.from.mockReturnValueOnce(mockEventsQuery);
      mockEventsQuery.limit.mockResolvedValueOnce({
        data: mockEventsData,
        error: null,
      });

      // 2番目の呼び出し（既存送金レコードのチェック）
      mockSupabase.from.mockReturnValueOnce(mockPayoutsQuery);
      mockPayoutsQuery.in.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      const result = await payoutService.findEligibleEvents();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("event-1");
      expect(result[0].total_stripe_sales).toBe(1000);
      expect(result[0].paid_attendances_count).toBe(1);
    });

    it("最小金額未満のイベントは除外される", async () => {
      const mockEventsData = [
        {
          id: "event-1",
          title: "テストイベント1",
          date: "2024-01-01",
          fee: 50,
          created_by: "user-1",
          created_at: "2024-01-01T00:00:00Z",
          attendances: [
            {
              id: "attendance-1",
              payments: [
                {
                  id: "payment-1",
                  method: "stripe",
                  status: "paid",
                  amount: 50, // 最小金額100円未満
                },
              ],
            },
          ],
        },
      ];

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
      };

      mockSupabase.from.mockReturnValue(mockQuery);
      mockQuery.select.mockResolvedValueOnce({
        data: mockEventsData,
        error: null,
      });

      mockQuery.select.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      const result = await payoutService.findEligibleEvents();

      expect(result).toHaveLength(0);
    });

    it("データベースエラー時は適切なエラーを投げる", async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
      };

      mockSupabase.from.mockReturnValue(mockQuery);
      mockQuery.select.mockResolvedValueOnce({
        data: null,
        error: { message: "Database error" },
      });

      await expect(payoutService.findEligibleEvents()).rejects.toThrow(PayoutError);
      await expect(payoutService.findEligibleEvents()).rejects.toThrow("送金対象イベントの検索に失敗しました");
    });
  });

  describe("calculatePayoutAmount", () => {
    it("送金金額を正しく計算できる", async () => {
      const mockPaymentsData = [
        {
          amount: 1000,
          attendances: { event_id: "event-1" },
        },
        {
          amount: 2000,
          attendances: { event_id: "event-1" },
        },
      ];

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
      };

      mockSupabase.from.mockReturnValue(mockQuery);
      mockQuery.select.mockResolvedValueOnce({
        data: mockPaymentsData,
        error: null,
      });

      const result = await payoutService.calculatePayoutAmount("event-1");

      expect(result.totalStripeSales).toBe(3000);
      expect(result.totalStripeFee).toBe(108); // 3000 * 0.036 = 108
      expect(result.platformFee).toBe(0); // MVP段階では0
      expect(result.netPayoutAmount).toBe(2892); // 3000 - 108 - 0
      expect(result.breakdown.stripePaymentCount).toBe(2);
      expect(result.breakdown.averageTransactionAmount).toBe(1500);
    });

    it("決済データがない場合は0を返す", async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
      };

      mockSupabase.from.mockReturnValue(mockQuery);
      mockQuery.select.mockResolvedValueOnce({
        data: [],
        error: null,
      });

      const result = await payoutService.calculatePayoutAmount("event-1");

      expect(result.totalStripeSales).toBe(0);
      expect(result.totalStripeFee).toBe(0);
      expect(result.platformFee).toBe(0);
      expect(result.netPayoutAmount).toBe(0);
      expect(result.breakdown.stripePaymentCount).toBe(0);
    });

    it("データベースエラー時は適切なエラーを投げる", async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
      };

      mockSupabase.from.mockReturnValue(mockQuery);
      mockQuery.select.mockResolvedValueOnce({
        data: null,
        error: { message: "Database error" },
      });

      await expect(payoutService.calculatePayoutAmount("event-1")).rejects.toThrow(PayoutError);
      await expect(payoutService.calculatePayoutAmount("event-1")).rejects.toThrow("決済データの取得に失敗しました");
    });
  });

  describe("processPayout", () => {
    it("送金処理を正しく実行できる", async () => {
      // StripeConnectアカウントのモック
      mockStripeConnectService.getConnectAccountByUser.mockResolvedValueOnce({
        user_id: "user-1",
        stripe_account_id: "acct_test",
        status: "verified",
        charges_enabled: true,
        payouts_enabled: true,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      });

      // 送金金額計算のモック
      jest.spyOn(payoutService, "calculatePayoutAmount").mockResolvedValueOnce({
        totalStripeSales: 3000,
        totalStripeFee: 108,
        platformFee: 0,
        netPayoutAmount: 2892,
        breakdown: {
          stripePaymentCount: 2,
          averageTransactionAmount: 1500,
          stripeFeeRate: 0.036,
          platformFeeRate: 0,
        },
      });

      // 送金レコード作成のモック
      const mockQuery = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn(),
      };

      mockSupabase.from.mockReturnValue(mockQuery);
      mockQuery.single.mockResolvedValueOnce({
        data: {
          id: "payout-1",
          event_id: "event-1",
          user_id: "user-1",
          net_payout_amount: 2892,
        },
        error: null,
      });

      // Stripe Transfer作成のモック
      const mockStripe = require("@/lib/stripe/client").stripe;
      mockStripe.transfers.create.mockResolvedValueOnce({
        id: "tr_test",
        amount: 2892,
        destination: "acct_test",
      });

      // ステータス更新のモック
      jest.spyOn(payoutService, "updatePayoutStatus").mockResolvedValueOnce();

      const result = await payoutService.processPayout({
        eventId: "event-1",
        userId: "user-1",
      });

      expect(result.payoutId).toBe("payout-1");
      expect(result.transferId).toBe("tr_test");
      expect(result.netAmount).toBe(2892);
      expect(mockStripeConnectService.getConnectAccountByUser).toHaveBeenCalledWith("user-1");
      expect(mockStripe.transfers.create).toHaveBeenCalledWith({
        amount: 2892,
        currency: "jpy",
        destination: "acct_test",
        metadata: {
          payout_id: "payout-1",
          event_id: "event-1",
          user_id: "user-1",
        },
      });
    });

    it("StripeConnectアカウントが設定されていない場合はエラーを投げる", async () => {
      mockStripeConnectService.getConnectAccountByUser.mockResolvedValueOnce(null);

      await expect(
        payoutService.processPayout({
          eventId: "event-1",
          userId: "user-1",
        })
      ).rejects.toThrow(PayoutError);

      await expect(
        payoutService.processPayout({
          eventId: "event-1",
          userId: "user-1",
        })
      ).rejects.toThrow("Stripe Connectアカウントが設定されていません");
    });

    it("送金が有効でない場合はエラーを投げる", async () => {
      mockStripeConnectService.getConnectAccountByUser.mockResolvedValueOnce({
        user_id: "user-1",
        stripe_account_id: "acct_test",
        status: "verified",
        charges_enabled: true,
        payouts_enabled: false, // 送金無効
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      });

      await expect(
        payoutService.processPayout({
          eventId: "event-1",
          userId: "user-1",
        })
      ).rejects.toThrow(PayoutError);

      await expect(
        payoutService.processPayout({
          eventId: "event-1",
          userId: "user-1",
        })
      ).rejects.toThrow("Stripe Connectアカウントで送金が有効になっていません");
    });
  });

  describe("getPayoutHistory", () => {
    it("送金履歴を正しく取得できる", async () => {
      const mockPayoutsData = [
        {
          id: "payout-1",
          event_id: "event-1",
          user_id: "user-1",
          status: "completed",
          net_payout_amount: 2892,
          created_at: "2024-01-01T00:00:00Z",
        },
      ];

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
      };

      mockSupabase.from.mockReturnValue(mockQuery);
      mockQuery.range.mockResolvedValueOnce({
        data: mockPayoutsData,
        error: null,
      });

      const result = await payoutService.getPayoutHistory({
        userId: "user-1",
      });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("payout-1");
      expect(result[0].status).toBe("completed");
    });

    it("データベースエラー時は適切なエラーを投げる", async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        range: jest.fn().mockReturnThis(),
      };

      mockSupabase.from.mockReturnValue(mockQuery);
      mockQuery.range.mockResolvedValueOnce({
        data: null,
        error: { message: "Database error" },
      });

      await expect(
        payoutService.getPayoutHistory({
          userId: "user-1",
        })
      ).rejects.toThrow(PayoutError);

      await expect(
        payoutService.getPayoutHistory({
          userId: "user-1",
        })
      ).rejects.toThrow("送金履歴の取得に失敗しました");
    });
  });

  describe("checkPayoutEligibility", () => {
    it("送金可能な場合は適切な結果を返す", async () => {
      // イベント情報のモック
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(),
      };

      mockSupabase.from.mockReturnValue(mockQuery);
      mockQuery.single.mockResolvedValueOnce({
        data: {
          id: "event-1",
          title: "テストイベント",
          date: "2024-01-01", // 5日以上前
          created_by: "user-1",
          status: "active",
        },
        error: null,
      });

      // 既存送金レコードのチェック
      jest.spyOn(payoutService, "getPayoutByEvent").mockResolvedValueOnce(null);

      // StripeConnectアカウントのモック
      mockStripeConnectService.getConnectAccountByUser.mockResolvedValueOnce({
        user_id: "user-1",
        stripe_account_id: "acct_test",
        status: "verified",
        charges_enabled: true,
        payouts_enabled: true,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      });

      // 送金金額計算のモック
      jest.spyOn(payoutService, "calculatePayoutAmount").mockResolvedValueOnce({
        totalStripeSales: 3000,
        totalStripeFee: 108,
        platformFee: 0,
        netPayoutAmount: 2892,
        breakdown: {
          stripePaymentCount: 2,
          averageTransactionAmount: 1500,
          stripeFeeRate: 0.036,
          platformFeeRate: 0,
        },
      });

      const result = await payoutService.checkPayoutEligibility("event-1", "user-1");

      expect(result.eligible).toBe(true);
      expect(result.estimatedAmount).toBe(2892);
      expect(result.reason).toBeUndefined();
    });

    it("イベントが見つからない場合は送金不可を返す", async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(),
      };

      mockSupabase.from.mockReturnValue(mockQuery);
      mockQuery.single.mockResolvedValueOnce({
        data: null,
        error: { code: "PGRST116" },
      });

      const result = await payoutService.checkPayoutEligibility("event-1", "user-1");

      expect(result.eligible).toBe(false);
      expect(result.reason).toBe("イベントが見つからないか、アクセス権限がありません");
    });
  });

  describe("getTransferInfo", () => {
    let mockStripeTransferService: jest.Mocked<any>;

    beforeEach(() => {
      mockStripeTransferService = (payoutService as any).stripeTransferService;
    });

    it("正常にTransfer情報を取得できる", async () => {
      const mockTransfer = {
        id: "tr_test123",
        amount: 1000,
        destination: "acct_test123",
        status: "paid",
        created: Math.floor(Date.now() / 1000),
        metadata: { payout_id: "payout_test123" },
      };

      mockStripeTransferService.getTransfer.mockResolvedValue(mockTransfer);

      const result = await payoutService.getTransferInfo("tr_test123");

      expect(result).toEqual({
        id: "tr_test123",
        amount: 1000,
        destination: "acct_test123",
        status: "paid",
        created: expect.any(Date),
        metadata: { payout_id: "payout_test123" },
      });

      expect(mockStripeTransferService.getTransfer).toHaveBeenCalledWith("tr_test123");
    });

    it("StripeTransferServiceのエラーを適切に処理する", async () => {
      const payoutError = new PayoutError(
        PayoutErrorType.STRIPE_API_ERROR,
        "Transfer not found"
      );

      mockStripeTransferService.getTransfer.mockRejectedValue(payoutError);

      await expect(payoutService.getTransferInfo("tr_nonexistent")).rejects.toThrow(payoutError);
    });

    it("一般的なエラーをPayoutErrorに変換する", async () => {
      const genericError = new Error("Network error");

      mockStripeTransferService.getTransfer.mockRejectedValue(genericError);

      await expect(payoutService.getTransferInfo("tr_test123")).rejects.toThrow(
        "Transfer情報の取得に失敗しました"
      );
    });
  });

  describe("cancelTransfer", () => {
    let mockStripeTransferService: jest.Mocked<any>;

    beforeEach(() => {
      mockStripeTransferService = (payoutService as any).stripeTransferService;
    });

    it("正常にTransferをキャンセルできる", async () => {
      const mockPayout = {
        id: "payout_test123",
        status: "processing" as const,
        stripe_transfer_id: "tr_test123",
        event_id: "event_test123",
        user_id: "user_test123",
      };

      // getPayoutByIdのモック
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn(),
      };

      mockSupabase.from.mockReturnValue(mockQuery);
      mockQuery.maybeSingle.mockResolvedValueOnce({
        data: mockPayout,
        error: null,
      });

      // StripeTransferServiceのキャンセルモック
      const mockTransfer = {
        id: "tr_test123",
        status: "reversed",
      };

      mockStripeTransferService.cancelTransfer.mockResolvedValue(mockTransfer);

      // updatePayoutStatusのモック
      const mockUpdateQuery = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn(),
      };

      mockSupabase.from.mockReturnValueOnce(mockUpdateQuery);
      mockUpdateQuery.maybeSingle.mockResolvedValueOnce({
        data: { id: "payout_test123" },
        error: null,
      });

      const result = await payoutService.cancelTransfer("payout_test123");

      expect(result).toEqual({
        success: true,
        message: "送金がキャンセルされました",
      });

      expect(mockStripeTransferService.cancelTransfer).toHaveBeenCalledWith("tr_test123");
    });

    it("送金レコードが見つからない場合はエラーを投げる", async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn(),
      };

      mockSupabase.from.mockReturnValue(mockQuery);
      mockQuery.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      await expect(payoutService.cancelTransfer("payout_nonexistent")).rejects.toThrow(
        new PayoutError(
          PayoutErrorType.PAYOUT_NOT_FOUND,
          "指定された送金レコードが見つかりません"
        )
      );
    });

    it("処理中でない送金はキャンセルできない", async () => {
      const mockPayout = {
        id: "payout_test123",
        status: "completed", // 処理中ではない
        stripe_transfer_id: "tr_test123",
      };

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn(),
      };

      mockSupabase.from.mockReturnValue(mockQuery);
      mockQuery.maybeSingle.mockResolvedValueOnce({
        data: mockPayout,
        error: null,
      });

      await expect(payoutService.cancelTransfer("payout_test123")).rejects.toThrow(
        new PayoutError(
          PayoutErrorType.INVALID_STATUS_TRANSITION,
          "処理中の送金のみキャンセル可能です"
        )
      );
    });

    it("Stripe Transfer IDがない場合はエラーを投げる", async () => {
      const mockPayout = {
        id: "payout_test123",
        status: "processing",
        stripe_transfer_id: null, // Transfer IDがない
      };

      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn(),
      };

      mockSupabase.from.mockReturnValue(mockQuery);
      mockQuery.maybeSingle.mockResolvedValueOnce({
        data: mockPayout,
        error: null,
      });

      await expect(payoutService.cancelTransfer("payout_test123")).rejects.toThrow(
        new PayoutError(
          PayoutErrorType.VALIDATION_ERROR,
          "Stripe Transfer IDが見つかりません"
        )
      );
    });
  });
});
