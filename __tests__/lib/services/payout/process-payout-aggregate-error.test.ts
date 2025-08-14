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

describe("PayoutService - AggregatePayoutError", () => {
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

  it("Stripe Transfer と updatePayoutStatus 両方失敗で AggregatePayoutError を throw する", async () => {
    // Stripe Transfer 失敗を設定
    mockStripeTransferService.createTransfer.mockRejectedValue(
      new PayoutError(PayoutErrorType.TRANSFER_CREATION_FAILED, "stripe error")
    );

    // updatePayoutStatus を失敗モック
    jest
      .spyOn(service as unknown as { updatePayoutStatus: AnyFn }, "updatePayoutStatus")
      .mockRejectedValue(new Error("db update failed"));

    // console.error をスパイ
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => { });

    await expect(
      service.processPayout({ eventId: "event_test", userId: "user_test" })
    ).rejects.toBeInstanceOf(AggregatePayoutError);

    // console.error 呼び出しを確認
    expect(consoleSpy).toHaveBeenCalledWith(
      "updatePayoutStatus failed",
      expect.objectContaining({
        payoutId: "payout_test123",
        updateErr: expect.any(Error),
      })
    );

    consoleSpy.mockRestore();
  });
});
