/**
 * PayoutService の Stripe Transfer機能テスト
 * タスク7.3: Stripe Transfer実行の実装
 */

import { PayoutService, PayoutErrorHandler } from "@/lib/services/payout";
import { StripeTransferService } from "@/lib/services/payout/stripe-transfer";
import { PayoutError, PayoutErrorType } from "@/lib/services/payout/types";
import { IStripeConnectService } from "@/lib/services/stripe-connect/interface";

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

// Supabaseクライアントのモック
const mockSupabase = {
  from: jest.fn(),
  rpc: jest.fn(),
};

describe("PayoutService - Stripe Transfer機能", () => {
  let payoutService: PayoutService;
  let errorHandler: PayoutErrorHandler;
  let mockStripeTransferService: jest.Mocked<any>;

  beforeEach(() => {
    jest.clearAllMocks();
    errorHandler = new PayoutErrorHandler();

    // StripeTransferServiceのモックインスタンスを取得
    const StripeTransferServiceMock = require("@/lib/services/payout/stripe-transfer").StripeTransferService;
    mockStripeTransferService = new StripeTransferServiceMock();

    payoutService = new PayoutService(
      "https://test.supabase.co",
      "test-key",
      errorHandler,
      mockStripeConnectService,
      mockStripeTransferService
    );

    // Supabaseクライアントのモックを設定
    (payoutService as any).supabase = mockSupabase;
  });

  describe("getTransferInfo", () => {
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
    it("正常にTransferをキャンセルできる", async () => {
      const mockPayout = {
        id: "payout_test123",
        status: "processing",
        stripe_transfer_id: "tr_test123",
        event_id: "event_test123",
        user_id: "user_test123",
      };

      // getPayoutByIdのモック
      const mockGetQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn(),
      };

      mockSupabase.from.mockReturnValueOnce(mockGetQuery);
      mockGetQuery.maybeSingle.mockResolvedValueOnce({
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
        "指定された送金レコードが見つかりません"
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
        "処理中の送金のみキャンセル可能です"
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
        "Stripe Transfer IDが見つかりません"
      );
    });
  });

  describe("processPayout - Stripe Transfer統合", () => {
    it("StripeTransferServiceを使用してTransferを作成する", async () => {
      const mockConnectAccount = {
        id: "connect_test123",
        user_id: "user_test123",
        stripe_account_id: "acct_test123",
        status: "verified",
        charges_enabled: true,
        payouts_enabled: true,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      const mockTransferResult = {
        transferId: "tr_test123",
        amount: 2892,
        destination: "acct_test123",
        status: "pending",
        created: Math.floor(Date.now() / 1000),
        estimatedArrival: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      // StripeConnectアカウントのモック
      mockStripeConnectService.getConnectAccountByUser.mockResolvedValue(mockConnectAccount);

      // 決済データ取得のモック
      const mockPaymentsQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
      };

      mockSupabase.from.mockReturnValueOnce(mockPaymentsQuery);
      // チェーンメソッドの最後でresolveする
      mockPaymentsQuery.eq.mockReturnThis();
      mockPaymentsQuery.eq.mockReturnThis();
      mockPaymentsQuery.eq.mockResolvedValueOnce({
        data: [
          { amount: 1000, method: "stripe", status: "paid" },
          { amount: 2000, method: "stripe", status: "paid" },
        ],
        error: null,
      });

      // RPC関数のモック（送金レコード作成）
      mockSupabase.rpc.mockResolvedValueOnce({
        data: "payout_test123",
        error: null,
      });

      // StripeTransferServiceのモック
      mockStripeTransferService.createTransfer.mockResolvedValue(mockTransferResult);

      // ステータス更新のモック
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

      // 送金処理を実行
      const result = await payoutService.processPayout({
        eventId: "event_test123",
        userId: "user_test123",
      });

      // 結果の検証
      expect(result.payoutId).toBe("payout_test123");
      expect(result.transferId).toBe("tr_test123");
      expect(result.netAmount).toBe(2892);
      expect(result.estimatedArrival).toBeDefined();

      // StripeTransferServiceの呼び出しを確認
      expect(mockStripeTransferService.createTransfer).toHaveBeenCalledWith({
        amount: 2892,
        currency: "jpy",
        destination: "acct_test123",
        metadata: {
          payout_id: "payout_test123",
          event_id: "event_test123",
          user_id: "user_test123",
        },
        description: "EventPay payout for event event_test123",
        transferGroup: "event_event_test123_payout",
      });

      // ステータス更新の確認
      expect(mockUpdateQuery.update).toHaveBeenCalledWith({
        status: "processing",
        updated_at: expect.any(String),
        stripe_transfer_id: "tr_test123",
        transfer_group: "event_event_test123_payout",
      });
    });

    it("StripeTransferService失敗時に適切にエラーハンドリングされる", async () => {
      const mockConnectAccount = {
        id: "connect_test123",
        user_id: "user_test123",
        stripe_account_id: "acct_test123",
        status: "verified",
        charges_enabled: true,
        payouts_enabled: true,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };

      const transferError = new PayoutError(
        PayoutErrorType.INSUFFICIENT_BALANCE,
        "プラットフォームアカウントの残高が不足しています"
      );

      // StripeConnectアカウントのモック
      mockStripeConnectService.getConnectAccountByUser.mockResolvedValue(mockConnectAccount);

      // 決済データ取得のモック
      const mockPaymentsQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
      };

      mockSupabase.from.mockReturnValueOnce(mockPaymentsQuery);
      // チェーンメソッドの最後でresolveする
      mockPaymentsQuery.eq.mockReturnThis();
      mockPaymentsQuery.eq.mockReturnThis();
      mockPaymentsQuery.eq.mockResolvedValueOnce({
        data: [{ amount: 1000, method: "stripe", status: "paid" }],
        error: null,
      });

      // RPC関数のモック
      mockSupabase.rpc.mockResolvedValueOnce({
        data: "payout_test123",
        error: null,
      });

      // StripeTransferServiceのエラーモック
      mockStripeTransferService.createTransfer.mockRejectedValue(transferError);

      // ステータス更新のモック（失敗時）
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

      // 送金処理を実行してエラーを確認
      await expect(
        payoutService.processPayout({
          eventId: "event_test123",
          userId: "user_test123",
        })
      ).rejects.toThrow(transferError);

      // 失敗時のステータス更新を確認
      expect(mockUpdateQuery.update).toHaveBeenCalledWith({
        status: "failed",
        updated_at: expect.any(String),
        last_error: "プラットフォームアカウントの残高が不足しています",
      });
    });
  });
});
