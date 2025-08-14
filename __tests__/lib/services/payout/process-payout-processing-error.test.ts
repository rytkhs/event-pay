import { PayoutService } from "@/lib/services/payout/service";
import {
  AggregatePayoutError,
  PayoutError,
  PayoutErrorType,
} from "@/lib/services/payout/types";

// モック用ユーティリティ型
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

// Supabaseクライアントの最小限モック
function createMockSupabaseClient() {
  return {
    rpc: jest.fn().mockImplementation((name: string) => {
      if (name === "process_event_payout") {
        return Promise.resolve({ data: "payout_test123", error: null });
      }
      return Promise.resolve({ error: null });
    }),
    from: jest.fn().mockImplementation((table: string) => {
      if (table === "fee_config") {
        return {
          select: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({
            data: {
              min_payout_amount: 100,
              stripe_base_rate: 0.036,
              stripe_fixed_fee: 0,
              platform_fee_rate: 0,
              platform_fixed_fee: 0,
              min_platform_fee: 0,
              max_platform_fee: null,
            },
            error: null,
          }),
        };
      }
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: {
            id: "payout_test123",
            net_payout_amount: 2000,
          },
          error: null,
        }),
      };
    }),
  } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

// ダミー依存モック
const mockErrorHandler = {} as any;
const mockStripeConnectService = {
  getConnectAccountByUser: jest.fn().mockResolvedValue({
    stripe_account_id: "acct_test",
    charges_enabled: true,
    payouts_enabled: true,
  }),
} as any;

const mockValidator = {
  validateProcessPayoutParams: jest.fn().mockResolvedValue(undefined),
  validateStripeConnectAccount: jest.fn().mockResolvedValue(undefined),
} as any;

// StripeTransferService のモック
const mockStripeTransferService = {
  createTransfer: jest.fn(),
} as any;

describe("PayoutService - Processing Error Status", () => {
  let service: PayoutService;

  beforeEach(() => {
    jest.clearAllMocks();

    const supabase = createMockSupabaseClient();

    service = new PayoutService(
      supabase,
      mockErrorHandler,
      mockStripeConnectService,
      mockValidator,
      mockStripeTransferService
    );

    // calculatePayoutAmount を固定値でモック
    jest
      .spyOn(service as unknown as { calculatePayoutAmount: AnyFn }, "calculatePayoutAmount")
      .mockResolvedValue({
        totalStripeSales: 2000,
        totalStripeFee: 0,
        platformFee: 0,
        netPayoutAmount: 2000,
        breakdown: {
          stripePaymentCount: 1,
          averageTransactionAmount: 2000,
          stripeFeeRate: 0,
          platformFeeRate: 0,
        },
      });
  });

  it("Transfer成功後のDB更新失敗時にprocessing_errorステータスを設定し、処理成功として返す", async () => {
    // Stripe Transfer 成功を設定
    mockStripeTransferService.createTransfer.mockResolvedValue({
      transferId: "tr_test123",
      estimatedArrival: new Date(),
      rateLimitInfo: {},
    });

    // updatePayoutStatus を1回目失敗、2回目成功でモック
    let callCount = 0;
    jest
      .spyOn(service as unknown as { updatePayoutStatus: AnyFn }, "updatePayoutStatus")
      .mockImplementation(async (params: any) => {
        callCount++;
        if (callCount === 1) {
          // 最初の processing への更新は失敗
          throw new Error("db connection failed");
        }
        // 2回目の processing_error への更新は成功
        return Promise.resolve();
      });

    // console.warn をスパイ
    const consoleSpy = jest.spyOn(console, "warn").mockImplementation(() => { });

    // 処理実行 - エラーではなく成功として返されるべき
    const result = await service.processPayout({
      eventId: "event_test",
      userId: "user_test"
    });

    // 成功結果を確認
    expect(result).toEqual({
      payoutId: "payout_test123",
      transferId: "tr_test123",
      netAmount: 2000,
      estimatedArrival: expect.any(String),
      rateLimitInfo: {},
    });

    // updatePayoutStatus が2回呼ばれることを確認
    expect(service.updatePayoutStatus).toHaveBeenCalledTimes(2);

    // 1回目: processing への更新
    expect(service.updatePayoutStatus).toHaveBeenNthCalledWith(1, {
      payoutId: "payout_test123",
      status: "processing",
      stripeTransferId: "tr_test123",
      transferGroup: expect.any(String),
    });

    // 2回目: processing_error への更新
    expect(service.updatePayoutStatus).toHaveBeenNthCalledWith(2, {
      payoutId: "payout_test123",
      status: "processing_error",
      stripeTransferId: "tr_test123",
      transferGroup: expect.any(String),
      lastError: "Transfer成功後のDB更新失敗: db connection failed",
      notes: "Webhook処理による自動復旧待ち",
    });

    // 警告ログが出力されることを確認
    expect(consoleSpy).toHaveBeenCalledWith(
      "Transfer成功後のDB更新失敗をprocessing_errorで記録",
      expect.objectContaining({
        payoutId: "payout_test123",
        transferId: "tr_test123",
        updateError: "db connection failed",
      })
    );

    consoleSpy.mockRestore();
  });

  it("processing_error設定も失敗した場合はAggregatePayoutErrorを投げる", async () => {
    // Stripe Transfer 成功を設定
    mockStripeTransferService.createTransfer.mockResolvedValue({
      transferId: "tr_test123",
      estimatedArrival: new Date(),
      rateLimitInfo: {},
    });

    // updatePayoutStatus を両方とも失敗でモック
    jest
      .spyOn(service as unknown as { updatePayoutStatus: AnyFn }, "updatePayoutStatus")
      .mockRejectedValue(new Error("db completely down"));

    // console.error をスパイ
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => { });

    // AggregatePayoutError が投げられることを確認
    await expect(
      service.processPayout({ eventId: "event_test", userId: "user_test" })
    ).rejects.toBeInstanceOf(AggregatePayoutError);

    // エラーログが出力されることを確認
    expect(consoleSpy).toHaveBeenCalledWith(
      "processing_error設定も失敗",
      expect.objectContaining({
        payoutId: "payout_test123",
        transferId: "tr_test123",
        originalError: expect.any(Error),
        secondUpdateError: expect.any(Error),
      })
    );

    consoleSpy.mockRestore();
  });
});
