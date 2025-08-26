/**
 * Destination charges対応のPaymentServiceテスト
 */

import { PaymentService, PaymentErrorHandler } from "@/lib/services/payment";
import { createDestinationCheckoutSession, createOrRetrieveCustomer } from "@/lib/stripe/destination-charges";
import { ApplicationFeeCalculator } from "@/lib/services/fee-config/application-fee-calculator";
import { createClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";

// モック
jest.mock("@/lib/stripe/destination-charges");
jest.mock("@/lib/services/fee-config/application-fee-calculator");
jest.mock("@/lib/logging/app-logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockCreateDestinationCheckoutSession = createDestinationCheckoutSession as jest.MockedFunction<
  typeof createDestinationCheckoutSession
>;
const mockCreateOrRetrieveCustomer = createOrRetrieveCustomer as jest.MockedFunction<
  typeof createOrRetrieveCustomer
>;

describe("PaymentService - Destination charges", () => {
  let paymentService: PaymentService;
  let mockSupabase: any;
  let mockApplicationFeeCalculator: jest.Mocked<ApplicationFeeCalculator>;

  beforeEach(() => {
    // Supabaseクライアントのモック
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn(),
    };

    // ApplicationFeeCalculatorのモック
    mockApplicationFeeCalculator = {
      calculateApplicationFee: jest.fn(),
      calculateApplicationFeeBatch: jest.fn(),
      validateConfig: jest.fn(),
    } as any;

    (ApplicationFeeCalculator as jest.MockedClass<typeof ApplicationFeeCalculator>).mockImplementation(
      () => mockApplicationFeeCalculator
    );

    const errorHandler = new PaymentErrorHandler();
    paymentService = new PaymentService(mockSupabase as any, errorHandler);

    // デフォルトのモック設定
    mockApplicationFeeCalculator.calculateApplicationFee.mockResolvedValue({
      amount: 1000,
      applicationFeeAmount: 100,
      config: {
        rate: 0.03,
        fixedFee: 30,
        minimumFee: 50,
        maximumFee: 500,
        taxRate: 0,
        isTaxIncluded: true,
      },
      calculation: {
        rateFee: 30,
        fixedFee: 30,
        beforeClipping: 60,
        afterMinimum: 60,
        afterMaximum: 100,
      },
      taxCalculation: {
        taxRate: 0,
        feeExcludingTax: 100,
        taxAmount: 0,
        isTaxIncluded: true,
      },
    });

    mockCreateOrRetrieveCustomer.mockResolvedValue({
      id: "cus_test123",
      email: "test@example.com",
      name: "Test User",
    } as any);

    mockCreateDestinationCheckoutSession.mockResolvedValue({
      id: "cs_test123",
      url: "https://checkout.stripe.com/pay/cs_test123",
    } as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("createStripeSession with Destination charges", () => {
    const baseParams = {
      attendanceId: "attendance-123",
      amount: 1000,
      eventId: "event-123",
      actorId: "user-123",
      eventTitle: "Test Event",
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
    };

    it("Destination chargesでCheckout Sessionを作成する", async () => {
      // 既存決済なし
      mockSupabase.single.mockResolvedValueOnce({ data: null, error: null });

      // 新規決済レコード作成
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: "payment-123" },
        error: null,
      });

      // Destination charges情報の更新
      mockSupabase.update.mockResolvedValueOnce({ error: null });

      const params = {
        ...baseParams,
        destinationCharges: {
          destinationAccountId: "acct_test123",
          userEmail: "test@example.com",
          userName: "Test User",
        },
      };

      const result = await paymentService.createStripeSession(params);

      // Application fee計算が呼ばれることを確認
      expect(mockApplicationFeeCalculator.calculateApplicationFee).toHaveBeenCalledWith(1000);

      // Customer作成が呼ばれることを確認
      expect(mockCreateOrRetrieveCustomer).toHaveBeenCalledWith({
        email: "test@example.com",
        name: "Test User",
        metadata: {
          actor_id: "user-123",
          event_id: "event-123",
        },
      });

      // Destination charges用のCheckout Session作成が呼ばれることを確認
      expect(mockCreateDestinationCheckoutSession).toHaveBeenCalledWith({
        eventId: "event-123",
        amount: 1000,
        destinationAccountId: "acct_test123",
        platformFeeAmount: 100,
        customerId: "cus_test123",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
        actorId: "user-123",
        metadata: {
          payment_id: "payment-123",
          attendance_id: "attendance-123",
          event_title: "Test Event",
        },
      });

      // DBの更新が呼ばれることを確認
      expect(mockSupabase.update).toHaveBeenCalledWith({
        stripe_checkout_session_id: "cs_test123",
        destination_account_id: "acct_test123",
        application_fee_amount: 100,
        transfer_group: "event_event-123_payout",
        stripe_customer_id: "cus_test123",
      });

      expect(result).toEqual({
        sessionUrl: "https://checkout.stripe.com/pay/cs_test123",
        sessionId: "cs_test123",
      });
    });

    it("Destination chargesなしの場合は従来フローを使用する", async () => {
      // 既存決済なし
      mockSupabase.single.mockResolvedValueOnce({ data: null, error: null });

      // 新規決済レコード作成
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: "payment-123" },
        error: null,
      });

      // セッションID更新
      mockSupabase.update.mockResolvedValueOnce({ error: null });

      // 従来のStripe APIモック
      const mockStripeSession = {
        id: "cs_traditional123",
        url: "https://checkout.stripe.com/pay/cs_traditional123",
      };

      // PaymentServiceの内部stripeクライアントをモック
      (paymentService as any).stripe = {
        checkout: {
          sessions: {
            create: jest.fn().mockResolvedValue(mockStripeSession),
          },
        },
      };

      const result = await paymentService.createStripeSession(baseParams);

      // Destination charges関連の関数が呼ばれないことを確認
      expect(mockApplicationFeeCalculator.calculateApplicationFee).not.toHaveBeenCalled();
      expect(mockCreateOrRetrieveCustomer).not.toHaveBeenCalled();
      expect(mockCreateDestinationCheckoutSession).not.toHaveBeenCalled();

      // 従来のStripe API呼び出しが行われることを確認
      expect((paymentService as any).stripe.checkout.sessions.create).toHaveBeenCalled();

      expect(result).toEqual({
        sessionUrl: "https://checkout.stripe.com/pay/cs_traditional123",
        sessionId: "cs_traditional123",
      });
    });

    it("Application fee計算エラーを適切に処理する", async () => {
      // 既存決済なし
      mockSupabase.single.mockResolvedValueOnce({ data: null, error: null });

      // 新規決済レコード作成
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: "payment-123" },
        error: null,
      });

      // Application fee計算でエラー
      mockApplicationFeeCalculator.calculateApplicationFee.mockRejectedValue(
        new Error("Fee calculation failed")
      );

      const params = {
        ...baseParams,
        destinationCharges: {
          destinationAccountId: "acct_test123",
          userEmail: "test@example.com",
          userName: "Test User",
        },
      };

      await expect(paymentService.createStripeSession(params)).rejects.toThrow(
        "Fee calculation failed"
      );

      // Destination charges関連の後続処理が呼ばれないことを確認
      expect(mockCreateOrRetrieveCustomer).not.toHaveBeenCalled();
      expect(mockCreateDestinationCheckoutSession).not.toHaveBeenCalled();
    });

    it("Customer作成エラーを適切に処理する", async () => {
      // 既存決済なし
      mockSupabase.single.mockResolvedValueOnce({ data: null, error: null });

      // 新規決済レコード作成
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: "payment-123" },
        error: null,
      });

      // Customer作成でエラー
      mockCreateOrRetrieveCustomer.mockRejectedValue(new Error("Customer creation failed"));

      const params = {
        ...baseParams,
        destinationCharges: {
          destinationAccountId: "acct_test123",
          userEmail: "test@example.com",
          userName: "Test User",
        },
      };

      await expect(paymentService.createStripeSession(params)).rejects.toThrow(
        "Customer creation failed"
      );

      // Application fee計算は呼ばれるが、Checkout Session作成は呼ばれないことを確認
      expect(mockApplicationFeeCalculator.calculateApplicationFee).toHaveBeenCalled();
      expect(mockCreateDestinationCheckoutSession).not.toHaveBeenCalled();
    });

    it("userEmailとuserNameが未指定の場合はCustomer作成をスキップする", async () => {
      // 既存決済なし
      mockSupabase.single.mockResolvedValueOnce({ data: null, error: null });

      // 新規決済レコード作成
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: "payment-123" },
        error: null,
      });

      // Destination charges情報の更新
      mockSupabase.update.mockResolvedValueOnce({ error: null });

      const params = {
        ...baseParams,
        destinationCharges: {
          destinationAccountId: "acct_test123",
          // userEmailとuserNameを指定しない
        },
      };

      const result = await paymentService.createStripeSession(params);

      // Customer作成が呼ばれないことを確認
      expect(mockCreateOrRetrieveCustomer).not.toHaveBeenCalled();

      // Destination charges用のCheckout Session作成でcustomerIdがundefinedで呼ばれることを確認
      expect(mockCreateDestinationCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: undefined,
        })
      );

      expect(result).toEqual({
        sessionUrl: "https://checkout.stripe.com/pay/cs_test123",
        sessionId: "cs_test123",
      });
    });
  });
});
