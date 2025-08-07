import { PaymentService, PaymentErrorHandler } from "@/lib/services/payment/service";
import { PaymentErrorType } from "@/lib/services/payment/types";
import { stripe } from "@/lib/stripe/client";

// Stripeモック
jest.mock("@/lib/stripe/client", () => ({
  stripe: {
    checkout: {
      sessions: {
        create: jest.fn(),
      },
    },
  },
}));

// Supabaseモック
const mockInsert = jest.fn();
const mockUpdate = jest.fn();
const mockEq = jest.fn();
const mockSelect = jest.fn();
const mockSingle = jest.fn();

const mockSupabase = {
  from: jest.fn(() => ({
    insert: mockInsert.mockReturnValue({
      select: mockSelect.mockReturnValue({
        single: mockSingle,
      }),
    }),
    update: mockUpdate.mockReturnValue({
      eq: mockEq,
    }),
  })),
};

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => mockSupabase),
}));

describe("PaymentService - Stripe Session Creation", () => {
  let paymentService: PaymentService;
  let errorHandler: PaymentErrorHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    mockInsert.mockClear();
    mockUpdate.mockClear();
    mockEq.mockClear();
    mockSelect.mockClear();
    mockSingle.mockClear();

    errorHandler = new PaymentErrorHandler();
    paymentService = new PaymentService("test-url", "test-key", errorHandler);
  });

  describe("createStripeSession", () => {
    const mockParams = {
      attendanceId: "att_test_123",
      amount: 1000,
      eventTitle: "テストイベント",
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
    };

    it("正常にStripe Checkout Sessionを作成する", async () => {
      // モックの設定
      const mockPayment = {
        id: "pay_test_123",
        attendance_id: "att_test_123",
        method: "stripe",
        amount: 1000,
        status: "pending",
      };

      const mockSession = {
        id: "cs_test_123",
        url: "https://checkout.stripe.com/pay/cs_test_123",
      };

      mockSingle.mockResolvedValue({
        data: mockPayment,
        error: null,
      });

      mockEq.mockResolvedValue({
        error: null,
      });

      (stripe.checkout.sessions.create as jest.Mock).mockResolvedValue(mockSession);

      // テスト実行
      const result = await paymentService.createStripeSession(mockParams);

      // 検証
      expect(result.sessionUrl).toBe("https://checkout.stripe.com/pay/cs_test_123");
      expect(result.sessionId).toBe("cs_test_123");

      // Stripe APIが正しいパラメータで呼ばれることを確認
      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "jpy",
              product_data: {
                name: "テストイベント",
                description: "イベント参加費",
              },
              unit_amount: 1000,
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: "https://example.com/success",
        cancel_url: "https://example.com/cancel",
        metadata: {
          payment_id: "pay_test_123",
          attendance_id: "att_test_123",
        },
        payment_intent_data: {
          metadata: {
            payment_id: "pay_test_123",
            attendance_id: "att_test_123",
          },
        },
        expires_at: expect.any(Number),
      });

      // データベース更新が呼ばれることを確認
      expect(mockSupabase.from).toHaveBeenCalledWith("payments");
      expect(mockUpdate).toHaveBeenCalledWith({
        stripe_session_id: "cs_test_123",
      });
    });

    it("決済レコード作成に失敗した場合、DATABASE_ERRORを投げる", async () => {
      const mockError = { message: "Database error" };
      mockSingle.mockResolvedValue({
        data: null,
        error: mockError,
      });

      await expect(paymentService.createStripeSession(mockParams)).rejects.toThrow();
    });

    it("Stripe API呼び出しに失敗した場合、STRIPE_API_ERRORを投げる", async () => {
      const mockPayment = {
        id: "pay_test_123",
        attendance_id: "att_test_123",
        method: "stripe",
        amount: 1000,
        status: "pending",
      };

      mockSingle.mockResolvedValue({
        data: mockPayment,
        error: null,
      });

      const stripeError = {
        type: "card_error",
        message: "Your card was declined.",
      };

      (stripe.checkout.sessions.create as jest.Mock).mockRejectedValue(stripeError);

      await expect(paymentService.createStripeSession(mockParams)).rejects.toThrow();
    });

    it("セッションID更新に失敗してもセッション作成は成功する", async () => {
      const mockPayment = {
        id: "pay_test_123",
        attendance_id: "att_test_123",
        method: "stripe",
        amount: 1000,
        status: "pending",
      };

      const mockSession = {
        id: "cs_test_123",
        url: "https://checkout.stripe.com/pay/cs_test_123",
      };

      mockSingle.mockResolvedValue({
        data: mockPayment,
        error: null,
      });

      // セッションID更新は失敗するが、セッション作成は成功
      mockEq.mockResolvedValue({
        error: { message: "Update failed" },
      });

      (stripe.checkout.sessions.create as jest.Mock).mockResolvedValue(mockSession);

      // コンソールエラーをモック
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      const result = await paymentService.createStripeSession(mockParams);

      expect(result.sessionUrl).toBe("https://checkout.stripe.com/pay/cs_test_123");
      expect(result.sessionId).toBe("cs_test_123");
      expect(consoleSpy).toHaveBeenCalledWith("Failed to update payment record with session ID:", {
        message: "Update failed",
      });

      consoleSpy.mockRestore();
    });
  });
});
