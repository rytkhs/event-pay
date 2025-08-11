/**
 * Stripe Transfer実行の統合テスト
 * タスク7.3: Stripe Transfer実行の実装
 */

import { PayoutService } from "@/lib/services/payout";
import { StripeTransferService } from "@/lib/services/payout/stripe-transfer";
import { PayoutErrorHandler } from "@/lib/services/payout/error-handler";
import { PayoutError, PayoutErrorType } from "@/lib/services/payout/types";
import { createClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";

// テスト用のSupabaseクライアント
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://test.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-key";

// StripeConnectServiceのモック
const mockStripeConnectService = {
  getConnectAccountByUser: jest.fn(),
  createExpressAccount: jest.fn(),
  createAccountLink: jest.fn(),
  getAccountInfo: jest.fn(),
  updateAccountStatus: jest.fn(),
  isChargesEnabled: jest.fn(),
  isPayoutsEnabled: jest.fn(),
  isAccountVerified: jest.fn(),
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

describe("Stripe Transfer実行 統合テスト", () => {
  let payoutService: PayoutService;
  let stripeTransferService: StripeTransferService;
  let errorHandler: PayoutErrorHandler;
  let mockStripe: jest.Mocked<any>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockStripe = require("@/lib/stripe/client").stripe;
    errorHandler = new PayoutErrorHandler();
    stripeTransferService = new StripeTransferService();

    payoutService = new PayoutService(
      supabaseUrl,
      supabaseKey,
      errorHandler,
      mockStripeConnectService,
      stripeTransferService
    );
  });

  describe("完全な送金フロー", () => {
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

    const mockTransfer = {
      id: "tr_test123",
      amount: 2892,
      currency: "jpy",
      destination: "acct_test123",
      status: "pending",
      created: Math.floor(Date.now() / 1000),
      metadata: {
        payout_id: "payout_test123",
        event_id: "event_test123",
        user_id: "user_test123",
      },
    };

    beforeEach(() => {
      // StripeConnectアカウントのモック
      mockStripeConnectService.getConnectAccountByUser.mockResolvedValue(mockConnectAccount);

      // Stripe Transfer作成のモック
      mockStripe.transfers.create.mockResolvedValue(mockTransfer);
    });

    it("正常な送金フローが完了する", async () => {
      // Supabaseクライアントのモック設定
      const mockSupabase = {
        from: jest.fn(),
        rpc: jest.fn(),
      };

      // 決済データ取得のモック
      const mockPaymentsQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
      };

      mockSupabase.from.mockReturnValue(mockPaymentsQuery);
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

      // PayoutServiceのSupabaseクライアントを置き換え
      (payoutService as any).supabase = mockSupabase;

      // 送金処理を実行
      const result = await payoutService.processPayout({
        eventId: "event_test123",
        userId: "user_test123",
      });

      // 結果の検証
      expect(result.payoutId).toBe("payout_test123");
      expect(result.transferId).toBe("tr_test123");
      expect(result.netAmount).toBe(2892); // 3000 - 108 (3.6%手数料)
      expect(result.estimatedArrival).toBeDefined();

      // Stripe Transfer作成の検証
      expect(mockStripe.transfers.create).toHaveBeenCalledWith(
        {
          amount: 2892,
          currency: "jpy",
          destination: "acct_test123",
          metadata: {
            payout_id: "payout_test123",
            event_id: "event_test123",
            user_id: "user_test123",
          },
          description: "EventPay payout for event event_test123",
          transfer_group: "event_event_test123_payout",
        },
        {} // テスト環境では冪等性キーを使用しない
      );

      // ステータス更新の検証
      expect(mockUpdateQuery.update).toHaveBeenCalledWith({
        status: "processing",
        updated_at: expect.any(String),
        stripe_transfer_id: "tr_test123",
        transfer_group: "event_event_test123_payout",
      });
    });

    it("Stripe Transfer失敗時に適切にエラーハンドリングされる", async () => {
      // Stripe APIエラーのモック
      const stripeError = new Error("Insufficient funds") as any;
      stripeError.code = "insufficient_funds";
      stripeError.type = "card_error";
      stripeError.statusCode = 402;

      mockStripe.transfers.create.mockRejectedValue(stripeError);

      // Supabaseクライアントのモック設定
      const mockSupabase = {
        from: jest.fn(),
        rpc: jest.fn(),
      };

      // 決済データ取得のモック
      const mockPaymentsQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
      };

      mockSupabase.from.mockReturnValue(mockPaymentsQuery);
      mockPaymentsQuery.eq.mockResolvedValueOnce({
        data: [{ amount: 1000, method: "stripe", status: "paid" }],
        error: null,
      });

      // RPC関数のモック（送金レコード作成）
      mockSupabase.rpc.mockResolvedValueOnce({
        data: "payout_test123",
        error: null,
      });

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

      // PayoutServiceのSupabaseクライアントを置き換え
      (payoutService as any).supabase = mockSupabase;

      // 送金処理を実行してエラーを確認
      await expect(
        payoutService.processPayout({
          eventId: "event_test123",
          userId: "user_test123",
        })
      ).rejects.toThrow(
        new PayoutError(
          PayoutErrorType.INSUFFICIENT_BALANCE,
          "プラットフォームアカウントの残高が不足しています"
        )
      );

      // 失敗時のステータス更新を確認
      expect(mockUpdateQuery.update).toHaveBeenCalledWith({
        status: "failed",
        updated_at: expect.any(String),
        last_error: "プラットフォームアカウントの残高が不足しています",
      });
    });

    it("リトライ機能が正常に動作する", async () => {
      // 最初の2回は失敗、3回目は成功
      const rateLimitError = new Error("Rate limit exceeded") as any;
      rateLimitError.code = "rate_limit";
      rateLimitError.statusCode = 429;

      mockStripe.transfers.create
        .mockRejectedValueOnce(rateLimitError)
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce(mockTransfer);

      // Supabaseクライアントのモック設定
      const mockSupabase = {
        from: jest.fn(),
        rpc: jest.fn(),
      };

      // 決済データ取得のモック
      const mockPaymentsQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
      };

      mockSupabase.from.mockReturnValue(mockPaymentsQuery);
      mockPaymentsQuery.eq.mockResolvedValueOnce({
        data: [{ amount: 1000, method: "stripe", status: "paid" }],
        error: null,
      });

      // RPC関数のモック
      mockSupabase.rpc.mockResolvedValueOnce({
        data: "payout_test123",
        error: null,
      });

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

      // PayoutServiceのSupabaseクライアントを置き換え
      (payoutService as any).supabase = mockSupabase;

      // 送金処理を実行
      const result = await payoutService.processPayout({
        eventId: "event_test123",
        userId: "user_test123",
      });

      // 結果の検証
      expect(result.transferId).toBe("tr_test123");

      // リトライが実行されたことを確認
      expect(mockStripe.transfers.create).toHaveBeenCalledTimes(3);
    }, 15000); // リトライ遅延のためタイムアウトを延長
  });

  describe("Transfer情報取得", () => {
    it("正常にTransfer情報を取得できる", async () => {
      const mockTransfer = {
        id: "tr_test123",
        amount: 1000,
        destination: "acct_test123",
        status: "paid",
        created: Math.floor(Date.now() / 1000),
        metadata: { payout_id: "payout_test123" },
      };

      mockStripe.transfers.retrieve.mockResolvedValue(mockTransfer);

      const result = await payoutService.getTransferInfo("tr_test123");

      expect(result).toEqual({
        id: "tr_test123",
        amount: 1000,
        destination: "acct_test123",
        status: "paid",
        created: expect.any(Date),
        metadata: { payout_id: "payout_test123" },
      });

      expect(mockStripe.transfers.retrieve).toHaveBeenCalledWith("tr_test123");
    });

    it("存在しないTransferでエラーが発生する", async () => {
      const stripeError = new Error("No such transfer") as any;
      stripeError.code = "resource_missing";
      stripeError.type = "invalid_request_error";
      stripeError.statusCode = 404;

      mockStripe.transfers.retrieve.mockRejectedValue(stripeError);

      await expect(payoutService.getTransferInfo("tr_nonexistent")).rejects.toThrow(PayoutError);
    });
  });

  describe("Transferキャンセル", () => {
    it("正常にTransferをキャンセルできる", async () => {
      const mockPayout = {
        id: "payout_test123",
        status: "processing",
        stripe_transfer_id: "tr_test123",
        event_id: "event_test123",
        user_id: "user_test123",
      };

      const mockTransfer = {
        id: "tr_test123",
        status: "reversed",
      };

      const mockReversal = {
        id: "trr_test123",
        amount: 1000,
        transfer: "tr_test123",
      };

      // Supabaseクライアントのモック設定
      const mockSupabase = {
        from: jest.fn(),
      };

      // 送金レコード取得のモック
      const mockGetQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn(),
      };

      mockSupabase.from.mockReturnValue(mockGetQuery);
      mockGetQuery.maybeSingle.mockResolvedValueOnce({
        data: mockPayout,
        error: null,
      });

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

      // Stripe APIのモック
      mockStripe.transfers.createReversal.mockResolvedValue(mockReversal);
      mockStripe.transfers.retrieve.mockResolvedValue(mockTransfer);

      // PayoutServiceのSupabaseクライアントを置き換え
      (payoutService as any).supabase = mockSupabase;

      // キャンセル処理を実行
      const result = await payoutService.cancelTransfer("payout_test123");

      expect(result).toEqual({
        success: true,
        message: "送金がキャンセルされました",
      });

      // Stripe APIの呼び出しを確認
      expect(mockStripe.transfers.createReversal).toHaveBeenCalledWith("tr_test123");
      expect(mockStripe.transfers.retrieve).toHaveBeenCalledWith("tr_test123");

      // ステータス更新を確認
      expect(mockUpdateQuery.update).toHaveBeenCalledWith({
        status: "failed",
        updated_at: expect.any(String),
        last_error: "Transfer cancelled by user",
        notes: "Transfer cancelled via reversal",
      });
    });

    it("キャンセル不可能なTransferでエラーが発生する", async () => {
      const mockPayout = {
        id: "payout_test123",
        status: "processing",
        stripe_transfer_id: "tr_test123",
      };

      const stripeError = new Error("Transfer cannot be reversed") as any;
      stripeError.code = "transfer_already_reversed";
      stripeError.type = "invalid_request_error";
      stripeError.statusCode = 400;

      // Supabaseクライアントのモック設定
      const mockSupabase = {
        from: jest.fn(),
      };

      const mockGetQuery = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn(),
      };

      mockSupabase.from.mockReturnValue(mockGetQuery);
      mockGetQuery.maybeSingle.mockResolvedValueOnce({
        data: mockPayout,
        error: null,
      });

      mockStripe.transfers.createReversal.mockRejectedValue(stripeError);

      // PayoutServiceのSupabaseクライアントを置き換え
      (payoutService as any).supabase = mockSupabase;

      await expect(payoutService.cancelTransfer("payout_test123")).rejects.toThrow(PayoutError);
    });
  });

  describe("エラーハンドリング", () => {
    it("ネットワークエラーが適切に処理される", async () => {
      const networkError = new Error("Network error") as any;
      networkError.code = "api_connection_error";
      networkError.type = "api_connection_error";

      mockStripe.transfers.create.mockRejectedValue(networkError);

      const params = {
        amount: 1000,
        currency: "jpy" as const,
        destination: "acct_test123",
        metadata: {
          payout_id: "payout_test123",
          event_id: "event_test123",
          user_id: "user_test123",
        },
      };

      await expect(stripeTransferService.createTransfer(params)).rejects.toThrow(
        new PayoutError(
          PayoutErrorType.STRIPE_API_ERROR,
          "Stripe APIエラーが発生しました: Network error"
        )
      );
    });

    it("アカウント無効エラーが適切に処理される", async () => {
      const accountError = new Error("Account invalid") as any;
      accountError.code = "account_invalid";
      accountError.type = "invalid_request_error";
      accountError.statusCode = 400;

      mockStripe.transfers.create.mockRejectedValue(accountError);

      const params = {
        amount: 1000,
        currency: "jpy" as const,
        destination: "acct_invalid",
        metadata: {
          payout_id: "payout_test123",
          event_id: "event_test123",
          user_id: "user_test123",
        },
      };

      await expect(stripeTransferService.createTransfer(params)).rejects.toThrow(
        new PayoutError(
          PayoutErrorType.STRIPE_ACCOUNT_NOT_READY,
          "送金先アカウントが無効または非アクティブです"
        )
      );
    });
  });
});
