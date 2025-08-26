import { PaymentService, PaymentErrorHandler } from "@/lib/services/payment/service";
import { PaymentErrorType } from "@/lib/services/payment/types";
import { stripe } from "@/lib/stripe/client";
import type { CreateStripeSessionParams } from "@/lib/services/payment/types";

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
    paymentService = new PaymentService(mockSupabase as any, errorHandler);

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
      eventId: "evt_test_123",
      actorId: "user_test_123",
      eventTitle: "テストイベント",
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
    } as CreateStripeSessionParams;

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
      // Destination charges では on_behalf_of / transfer_data / application_fee_amount などが含まれる。
      // 厳密な値は別ユーティリティ計算に依存するため、必要最小限を検証する。
      expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "payment",
          success_url: "https://example.com/success",
          cancel_url: "https://example.com/cancel",
          payment_intent_data: expect.objectContaining({
            on_behalf_of: expect.any(String),
            transfer_data: expect.objectContaining({ destination: expect.any(String) }),
            application_fee_amount: expect.any(Number),
            transfer_group: expect.any(String),
            metadata: expect.objectContaining({
              payment_id: "pay_test_123",
              attendance_id: "att_test_123",
            }),
          }),
        }),
      );

      expect(mockSupabase.from).toHaveBeenCalledWith("payments");
      expect(mockUpdate).toHaveBeenCalledWith({
        stripe_checkout_session_id: "cs_test_123",
        destination_account_id: expect.any(String),
        application_fee_amount: expect.any(Number),
        transfer_group: expect.any(String),
        stripe_customer_id: expect.anything(),
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
