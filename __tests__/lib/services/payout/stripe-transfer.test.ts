/**
 * StripeTransferService のテスト
 * タスク7.3: Stripe Transfer実行の実装
 */

import { StripeTransferService } from "@/lib/services/payout/stripe-transfer";
import { PayoutError, PayoutErrorType } from "@/lib/services/payout/types";
import Stripe from "stripe";

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

describe("StripeTransferService", () => {
  let service: StripeTransferService;
  let mockStripe: jest.Mocked<Stripe>;

  beforeEach(() => {
    service = new StripeTransferService();
    mockStripe = require("@/lib/stripe/client").stripe;
    jest.clearAllMocks();
  });

  describe("createTransfer", () => {
    const validParams = {
      amount: 1000,
      currency: "jpy" as const,
      destination: "acct_test123",
      metadata: {
        payout_id: "payout_test123",
        event_id: "event_test123",
        user_id: "user_test123",
      },
      description: "Test transfer",
      transferGroup: "test_group",
    };

    const mockTransfer = {
      id: "tr_test123",
      amount: 1000,
      destination: "acct_test123",
      status: "pending",
      created: Math.floor(Date.now() / 1000),
      metadata: validParams.metadata,
    };

    it("正常にTransferを作成できる", async () => {
      mockStripe.transfers.create.mockResolvedValue(mockTransfer as Stripe.Transfer);

      const result = await service.createTransfer(validParams);

      expect(result).toEqual({
        transferId: "tr_test123",
        amount: 1000,
        destination: "acct_test123",
        status: "pending",
        created: mockTransfer.created,
        estimatedArrival: expect.any(Date),
      });

      expect(mockStripe.transfers.create).toHaveBeenCalledWith(
        {
          amount: 1000,
          currency: "jpy",
          destination: "acct_test123",
          metadata: validParams.metadata,
          description: "Test transfer",
          transfer_group: "test_group",
        },
        {} // テスト環境では冪等性キーを使用しない
      );
    });

    it("無効な金額でエラーが発生する", async () => {
      const invalidParams = { ...validParams, amount: 0 };

      await expect(service.createTransfer(invalidParams)).rejects.toThrow(
        new PayoutError(
          PayoutErrorType.VALIDATION_ERROR,
          "送金金額は1円以上である必要があります"
        )
      );

      expect(mockStripe.transfers.create).not.toHaveBeenCalled();
    });

    it("金額上限を超えるとエラーが発生する", async () => {
      const invalidParams = { ...validParams, amount: 1000000000 }; // 10億円

      await expect(service.createTransfer(invalidParams)).rejects.toThrow(
        new PayoutError(
          PayoutErrorType.VALIDATION_ERROR,
          "送金金額が上限を超えています"
        )
      );

      expect(mockStripe.transfers.create).not.toHaveBeenCalled();
    });

    it("無効な通貨でエラーが発生する", async () => {
      const invalidParams = { ...validParams, currency: "usd" as any };

      await expect(service.createTransfer(invalidParams)).rejects.toThrow(
        new PayoutError(
          PayoutErrorType.VALIDATION_ERROR,
          "サポートされていない通貨です"
        )
      );

      expect(mockStripe.transfers.create).not.toHaveBeenCalled();
    });

    it("無効な送金先アカウントIDでエラーが発生する", async () => {
      const invalidParams = { ...validParams, destination: "invalid_account" };

      await expect(service.createTransfer(invalidParams)).rejects.toThrow(
        new PayoutError(
          PayoutErrorType.VALIDATION_ERROR,
          "無効な送金先アカウントIDです"
        )
      );

      expect(mockStripe.transfers.create).not.toHaveBeenCalled();
    });

    it("必須メタデータが不足するとエラーが発生する", async () => {
      const invalidParams = {
        ...validParams,
        metadata: { payout_id: "test" }, // event_id と user_id が不足
      };

      await expect(service.createTransfer(invalidParams)).rejects.toThrow(
        new PayoutError(
          PayoutErrorType.VALIDATION_ERROR,
          "必須のメタデータが不足しています"
        )
      );

      expect(mockStripe.transfers.create).not.toHaveBeenCalled();
    });

    it("Stripe APIエラーを適切にハンドリングする", async () => {
      const stripeError = new Error("Stripe API error") as Stripe.StripeError;
      stripeError.code = "account_invalid";
      stripeError.type = "invalid_request_error";
      stripeError.statusCode = 400;

      mockStripe.transfers.create.mockRejectedValue(stripeError);

      await expect(service.createTransfer(validParams)).rejects.toThrow(
        "送金先アカウントが無効または非アクティブです"
      );
    });

    it("レート制限エラーでリトライが実行される", async () => {
      const rateLimitError = new Error("Rate limit exceeded") as Stripe.StripeError;
      rateLimitError.code = "rate_limit";
      rateLimitError.statusCode = 429;

      // 最初の2回は失敗、3回目は成功
      mockStripe.transfers.create
        .mockRejectedValueOnce(rateLimitError)
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce(mockTransfer as Stripe.Transfer);

      const result = await service.createTransfer(validParams);

      expect(result.transferId).toBe("tr_test123");
      expect(mockStripe.transfers.create).toHaveBeenCalledTimes(3);
    }, 10000); // タイムアウトを10秒に設定（リトライ遅延のため）

    it("最大リトライ回数を超えるとエラーが発生する", async () => {
      const rateLimitError = new Error("Rate limit exceeded") as Stripe.StripeError;
      rateLimitError.code = "rate_limit";
      rateLimitError.statusCode = 429;

      mockStripe.transfers.create.mockRejectedValue(rateLimitError);

      await expect(service.createTransfer(validParams)).rejects.toThrow(
        "Stripe APIのレート制限に達しました。しばらく待ってから再試行してください。"
      );

      expect(mockStripe.transfers.create).toHaveBeenCalledTimes(4); // 初回 + 3回リトライ
    }, 15000); // タイムアウトを15秒に設定
  });

  describe("getTransfer", () => {
    const mockTransfer = {
      id: "tr_test123",
      amount: 1000,
      destination: "acct_test123",
      status: "paid",
      created: Math.floor(Date.now() / 1000),
      metadata: { payout_id: "payout_test123" },
    };

    it("正常にTransfer情報を取得できる", async () => {
      mockStripe.transfers.retrieve.mockResolvedValue(mockTransfer as Stripe.Transfer);

      const result = await service.getTransfer("tr_test123");

      expect(result).toEqual(mockTransfer);
      expect(mockStripe.transfers.retrieve).toHaveBeenCalledWith("tr_test123");
    });

    it("存在しないTransfer IDでエラーが発生する", async () => {
      const stripeError = new Error("No such transfer") as Stripe.StripeError;
      stripeError.code = "resource_missing";
      stripeError.type = "invalid_request_error";
      stripeError.statusCode = 404;

      mockStripe.transfers.retrieve.mockRejectedValue(stripeError);

      await expect(service.getTransfer("tr_nonexistent")).rejects.toThrow(PayoutError);
    });
  });

  describe("cancelTransfer", () => {
    const mockTransfer = {
      id: "tr_test123",
      amount: 1000,
      destination: "acct_test123",
      status: "pending",
      created: Math.floor(Date.now() / 1000),
    };

    const mockReversal = {
      id: "trr_test123",
      amount: 1000,
      transfer: "tr_test123",
    };

    it("正常にTransferをキャンセルできる", async () => {
      mockStripe.transfers.createReversal.mockResolvedValue(mockReversal as Stripe.TransferReversal);
      mockStripe.transfers.retrieve.mockResolvedValue(mockTransfer as Stripe.Transfer);

      const result = await service.cancelTransfer("tr_test123");

      expect(result).toEqual(mockTransfer);
      expect(mockStripe.transfers.createReversal).toHaveBeenCalledWith("tr_test123");
      expect(mockStripe.transfers.retrieve).toHaveBeenCalledWith("tr_test123");
    });

    it("キャンセル不可能なTransferでエラーが発生する", async () => {
      const stripeError = new Error("Transfer cannot be reversed") as Stripe.StripeError;
      stripeError.code = "transfer_already_reversed";
      stripeError.type = "invalid_request_error";
      stripeError.statusCode = 400;

      mockStripe.transfers.createReversal.mockRejectedValue(stripeError);

      await expect(service.cancelTransfer("tr_test123")).rejects.toThrow(PayoutError);
    });
  });

  describe("エラーハンドリング", () => {
    const validParams = {
      amount: 1000,
      currency: "jpy" as const,
      destination: "acct_test123",
      metadata: {
        payout_id: "payout_test123",
        event_id: "event_test123",
        user_id: "user_test123",
      },
    };

    it("insufficient_funds エラーを適切にマッピングする", async () => {
      const stripeError = new Error("Insufficient funds") as Stripe.StripeError;
      stripeError.code = "insufficient_funds";
      stripeError.type = "card_error";
      stripeError.statusCode = 402;

      mockStripe.transfers.create.mockRejectedValue(stripeError);

      await expect(service.createTransfer(validParams)).rejects.toThrow(
        "プラットフォームアカウントの残高が不足しています"
      );
    });

    it("api_connection_error エラーを適切にマッピングする", async () => {
      const stripeError = new Error("Connection error") as Stripe.StripeError;
      stripeError.code = "api_connection_error";
      stripeError.type = "api_connection_error";

      mockStripe.transfers.create.mockRejectedValue(stripeError);

      await expect(service.createTransfer(validParams)).rejects.toThrow(
        "Stripe APIエラーが発生しました: Connection error"
      );
    }, 10000); // タイムアウトを10秒に設定

    it("未知のエラーを適切にマッピングする", async () => {
      const stripeError = new Error("Unknown error") as Stripe.StripeError;
      stripeError.code = "unknown_error";
      stripeError.type = "api_error";

      mockStripe.transfers.create.mockRejectedValue(stripeError);

      await expect(service.createTransfer(validParams)).rejects.toThrow(
        "Transfer作成に失敗しました: Unknown error"
      );
    });
  });

  describe("冪等性キー生成", () => {
    it("一意の冪等性キーが生成される", async () => {
      const params1 = {
        amount: 1000,
        currency: "jpy" as const,
        destination: "acct_test123",
        metadata: {
          payout_id: "payout_test123",
          event_id: "event_test123",
          user_id: "user_test123",
        },
      };

      const params2 = {
        ...params1,
        amount: 2000, // 金額が異なる
      };

      const mockTransfer = {
        id: "tr_test123",
        amount: 1000,
        destination: "acct_test123",
        status: "pending",
        created: Math.floor(Date.now() / 1000),
      };

      mockStripe.transfers.create.mockResolvedValue(mockTransfer as Stripe.Transfer);

      // 本番環境での冪等性キー使用をテストするため、NODE_ENVを一時的に変更
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      try {
        await service.createTransfer(params1);
        await service.createTransfer(params2);

        // 異なる冪等性キーで2回呼び出されることを確認
        expect(mockStripe.transfers.create).toHaveBeenCalledTimes(2);

        const firstCall = mockStripe.transfers.create.mock.calls[0];
        const secondCall = mockStripe.transfers.create.mock.calls[1];

        // 冪等性キーが異なることを確認
        expect(firstCall[1]?.idempotencyKey).not.toBe(secondCall[1]?.idempotencyKey);
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });
  });
});
