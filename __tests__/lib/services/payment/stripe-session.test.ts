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
const mockSelectAfterInsert = jest.fn();
const mockSingle = jest.fn();

// 検索チェーン（.select().eq().order().order().limit()）
let chainSelect: jest.Mock;
let chainEq: jest.Mock;
let chainOrder1: jest.Mock;
let chainOrder2: jest.Mock;
let chainLimit: jest.Mock;

const mockSupabase = {
  from: jest.fn(() => ({
    // 既存検索用のselectチェーン
    select: chainSelect,
    // 挿入後の select().single()
    insert: mockInsert.mockReturnValue({
      select: mockSelectAfterInsert.mockReturnValue({
        single: mockSingle,
      }),
    }),
    // 更新用
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
    mockSelectAfterInsert.mockClear();
    mockSingle.mockClear();

    errorHandler = new PaymentErrorHandler();
    paymentService = new PaymentService("test-url", "test-key", errorHandler);

    // 既存検索は空配列を返す（=既存なし）
    chainLimit = jest.fn().mockResolvedValue({ data: [], error: null });
    chainOrder2 = jest.fn(() => ({ limit: chainLimit }));
    chainOrder1 = jest.fn(() => ({ order: chainOrder2 }));
    chainEq = jest.fn(() => ({ order: chainOrder1 }));
    chainSelect = jest.fn(() => ({ eq: chainEq }));
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

      // 既存検索: 既存なし
      chainLimit.mockResolvedValueOnce({ data: [], error: null });

      // INSERT -> select().single()
      mockSingle.mockResolvedValueOnce({ data: mockPayment, error: null });

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

      // 既存検索: 既存なし
      chainLimit.mockResolvedValueOnce({ data: [], error: null });

      // INSERT -> select().single()
      mockSingle.mockResolvedValueOnce({ data: mockPayment, error: null });

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

      // 既存検索: 既存なし
      chainLimit.mockResolvedValueOnce({ data: [], error: null });

      // INSERT -> select().single()
      mockSingle.mockResolvedValueOnce({ data: mockPayment, error: null });

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
      // ErrorHandler経由の構造化ログ
      expect(consoleSpy).toHaveBeenCalled();
      const firstCallArgs = (consoleSpy as unknown as jest.Mock).mock.calls[0];
      expect(firstCallArgs[0]).toBe("PaymentError:");
      expect(firstCallArgs[1]).toMatchObject({
        errorType: PaymentErrorType.DATABASE_ERROR,
        context: {
          operation: "updateStripeSessionId",
          paymentId: expect.any(String),
          sessionId: "cs_test_123",
        },
      });

      consoleSpy.mockRestore();
    });
  });
});
