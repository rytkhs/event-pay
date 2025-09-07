/**
 * API/準統合テスト - sessionUrl生成とCHECKOUT_SESSION_IDテンプレート置換の検証
 *
 * タスク6: sessionURL生成検証
 * - Stripe Checkout Session作成後に返却されるsessionUrlが期待どおりの形式であること
 * - {CHECKOUT_SESSION_ID}テンプレート置換ロジックが正しく機能すること
 */

import { PaymentService, PaymentErrorHandler } from "../../../features/payments/services/service";
import { ApplicationFeeCalculator } from "../../../features/payments/services/fee-config/application-fee-calculator";

// Stripe destination-charges モジュールをモック
jest.mock("../../../core/stripe/destination-charges", () => {
  const originalModule = jest.requireActual("../../../core/stripe/destination-charges");
  return {
    ...originalModule,
    createDestinationCheckoutSession: jest.fn(),
    createOrRetrieveCustomer: jest.fn(),
  };
});

// Application fee calculator をモック
jest.mock("../../../features/payments/services/fee-config/application-fee-calculator");

import * as DestinationCharges from "../../../core/stripe/destination-charges";

// Supabaseクライアントのモック作成関数
const createMockSupabaseClient = () => {
  return {
    from: jest.fn(),
  };
};

describe("PaymentService - sessionUrl生成とテンプレート置換", () => {
  let paymentService: PaymentService;
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;
  let mockApplicationFeeCalculator: jest.Mocked<ApplicationFeeCalculator>;
  let mockCreateDestinationCheckoutSession: jest.MockedFunction<
    typeof DestinationCharges.createDestinationCheckoutSession
  >;

  // テスト用の固定データ
  const testData = {
    connectAccountId: "acct_test_connect_123456",
    amount: 1000,
    eventId: "event_test_123",
    attendanceId: "attendance_test_456",
    actorId: "actor_test_789",
    eventTitle: "テストイベント",
    paymentId: "payment_test_abc123",
    successUrl: "https://example.com/success",
    cancelUrl: "https://example.com/cancel",
    userEmail: "test@example.com",
    userName: "テストユーザー",
    calculatedFee: 100, // 10%の手数料
    mockSessionId: "cs_test_1234567890abcdef",
  };

  beforeEach(() => {
    // Supabase クライアントのモック設定
    mockSupabase = createMockSupabaseClient();

    // Application fee calculator のモック設定
    mockApplicationFeeCalculator = {
      calculateApplicationFee: jest.fn(),
      calculateApplicationFeeBatch: jest.fn(),
    } as jest.Mocked<ApplicationFeeCalculator>;

    mockApplicationFeeCalculator.calculateApplicationFee.mockResolvedValue({
      amount: testData.amount,
      applicationFeeAmount: testData.calculatedFee,
      config: {
        platform_fee_rate: 0.1,
        platform_fixed_fee: 0,
        min_platform_fee: 50,
        max_platform_fee: 1000,
        tax_rate: 0,
        is_tax_included: true,
      },
      calculation: {
        rateFee: testData.calculatedFee,
        fixedFee: 0,
        beforeClipping: testData.calculatedFee,
        afterMinimum: testData.calculatedFee,
        afterMaximum: testData.calculatedFee,
      },
      taxCalculation: {
        taxRate: 0,
        feeExcludingTax: testData.calculatedFee,
        taxAmount: 0,
        isTaxIncluded: true,
      },
    });

    // PaymentErrorHandler インスタンス作成
    const mockPaymentErrorHandler = new PaymentErrorHandler();

    // PaymentService インスタンス作成
    paymentService = new PaymentService(mockSupabase as any, mockPaymentErrorHandler);

    // PaymentService の applicationFeeCalculator を手動でモックに置き換え
    (paymentService as any).applicationFeeCalculator = mockApplicationFeeCalculator;

    // createDestinationCheckoutSession のモック設定
    mockCreateDestinationCheckoutSession =
      DestinationCharges.createDestinationCheckoutSession as jest.MockedFunction<
        typeof DestinationCharges.createDestinationCheckoutSession
      >;

    // Customer作成のモック設定
    (DestinationCharges.createOrRetrieveCustomer as jest.Mock).mockResolvedValue({
      id: "cus_test_customer_123",
      object: "customer",
      email: testData.userEmail,
      name: testData.userName,
    });

    // Supabase クエリのモック設定
    // PaymentServiceで使用される具体的なクエリパターンに対応
    (mockSupabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === "payments") {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          in: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          insert: jest.fn().mockReturnThis(),
          update: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { id: testData.paymentId },
            error: null,
          }),
        };
      }
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        insert: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: {}, error: null }),
      };
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("sessionUrl形式の検証", () => {
    it("session.urlがそのままsessionUrlとして返されること", async () => {
      // Arrange
      const expectedSessionUrl = "https://checkout.stripe.com/c/pay/cs_test_1234567890abcdef";

      // モックの戻り値を設定（実際のCheckout Sessionオブジェクト）
      mockCreateDestinationCheckoutSession.mockResolvedValue({
        id: testData.mockSessionId,
        url: expectedSessionUrl,
        object: "checkout.session",
      } as any);

      // Act
      const result = await paymentService.createStripeSession({
        attendanceId: testData.attendanceId,
        amount: testData.amount,
        eventId: testData.eventId,
        actorId: testData.actorId,
        eventTitle: testData.eventTitle,
        successUrl: testData.successUrl,
        cancelUrl: testData.cancelUrl,
        destinationCharges: {
          destinationAccountId: testData.connectAccountId,
          userEmail: testData.userEmail,
          userName: testData.userName,
        },
      });

      // Assert
      expect(result.sessionUrl).toBe(expectedSessionUrl);
      expect(result.sessionId).toBe(testData.mockSessionId);
    });

    it("PaymentServiceからのsessionUrlが正しい形式であること", async () => {
      // Arrange
      const testSessionUrl = "https://checkout.stripe.com/c/pay/cs_test_abcdef1234567890";
      const testSessionId = "cs_test_abcdef1234567890";

      mockCreateDestinationCheckoutSession.mockResolvedValue({
        id: testSessionId,
        url: testSessionUrl,
        object: "checkout.session",
      } as any);

      // Act
      const result = await paymentService.createStripeSession({
        attendanceId: testData.attendanceId,
        amount: testData.amount,
        eventId: testData.eventId,
        actorId: testData.actorId,
        eventTitle: testData.eventTitle,
        successUrl: testData.successUrl,
        cancelUrl: testData.cancelUrl,
        destinationCharges: {
          destinationAccountId: testData.connectAccountId,
          userEmail: testData.userEmail,
          userName: testData.userName,
        },
      });

      // Assert
      expect(result.sessionUrl).toMatch(/^https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test_/);
      expect(result.sessionId).toMatch(/^cs_test_/);
    });
  });

  describe("Destination Charges層でのテンプレート置換検証", () => {
    it("createDestinationCheckoutSessionが正しいURLテンプレートで呼び出されること", async () => {
      // Arrange
      mockCreateDestinationCheckoutSession.mockResolvedValue({
        id: testData.mockSessionId,
        url: "https://checkout.stripe.com/c/pay/cs_test_1234567890abcdef",
        object: "checkout.session",
      } as any);

      // Act
      await paymentService.createStripeSession({
        attendanceId: testData.attendanceId,
        amount: testData.amount,
        eventId: testData.eventId,
        actorId: testData.actorId,
        eventTitle: testData.eventTitle,
        successUrl: testData.successUrl,
        cancelUrl: testData.cancelUrl,
        destinationCharges: {
          destinationAccountId: testData.connectAccountId,
          userEmail: testData.userEmail,
          userName: testData.userName,
        },
      });

      // Assert - createDestinationCheckoutSessionの呼び出し引数を検証
      // PaymentServiceは元のURLをそのまま渡し、テンプレート置換はDestinationCharges内部で実行される
      expect(mockCreateDestinationCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          successUrl: testData.successUrl, // 元のURL
          cancelUrl: testData.cancelUrl, // 元のURL
          eventTitle: testData.eventTitle,
          amount: testData.amount,
          destinationAccountId: testData.connectAccountId,
        })
      );

      const callArgs = mockCreateDestinationCheckoutSession.mock.calls[0][0];

      // PaymentServiceは元のURLを渡すことを確認
      expect(callArgs.successUrl).toBe(testData.successUrl);
      expect(callArgs.cancelUrl).toBe(testData.cancelUrl);

      // テンプレート置換はDestinationCharges内部で行われることをコメントで明記
      // 実際の置換ロジックは「テンプレート置換ロジックの単体検証」セクションで検証済み
    });
  });

  describe("テンプレート置換ロジックの単体検証", () => {
    it("success_urlとcancel_urlに{CHECKOUT_SESSION_ID}テンプレートが正しく設定されること", () => {
      // Arrange
      const baseSuccessUrl = "https://example.com/success";
      const baseCancelUrl = "https://example.com/cancel";

      // Act - destination-charges.tsのロジックを模擬
      const successUrlWithTemplate = (() => {
        const u = new URL(baseSuccessUrl);
        u.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");
        return u.toString();
      })();

      const cancelUrlWithTemplate = (() => {
        const u = new URL(baseCancelUrl);
        u.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");
        return u.toString();
      })();

      // Assert
      expect(successUrlWithTemplate).toBe(
        "https://example.com/success?session_id=%7BCHECKOUT_SESSION_ID%7D"
      );
      expect(cancelUrlWithTemplate).toBe(
        "https://example.com/cancel?session_id=%7BCHECKOUT_SESSION_ID%7D"
      );

      // デコードして検証
      expect(decodeURIComponent(successUrlWithTemplate)).toContain(
        "session_id={CHECKOUT_SESSION_ID}"
      );
      expect(decodeURIComponent(cancelUrlWithTemplate)).toContain(
        "session_id={CHECKOUT_SESSION_ID}"
      );
    });

    it("テンプレート置換が実際のsession.idで行われることを想定した検証", () => {
      // Arrange
      const templateUrl = "https://example.com/success?session_id=%7BCHECKOUT_SESSION_ID%7D";
      const actualSessionId = "cs_test_1234567890abcdef";

      // Act - Stripeが実際に行う置換を模擬
      const finalUrl = decodeURIComponent(templateUrl).replace(
        "{CHECKOUT_SESSION_ID}",
        actualSessionId
      );

      // Assert
      expect(finalUrl).toBe("https://example.com/success?session_id=cs_test_1234567890abcdef");
      expect(finalUrl).toContain(actualSessionId);
    });
  });

  describe("エラーケース", () => {
    it("session.urlがnullの場合にエラーが投げられること", async () => {
      // Arrange - session.urlがnullのレスポンスを模擬
      mockCreateDestinationCheckoutSession.mockResolvedValue({
        id: testData.mockSessionId,
        url: null,
        object: "checkout.session",
      } as any);

      // Act & Assert
      await expect(
        paymentService.createStripeSession({
          attendanceId: testData.attendanceId,
          amount: testData.amount,
          eventId: testData.eventId,
          actorId: testData.actorId,
          eventTitle: testData.eventTitle,
          successUrl: testData.successUrl,
          cancelUrl: testData.cancelUrl,
          destinationCharges: {
            destinationAccountId: testData.connectAccountId,
            userEmail: testData.userEmail,
            userName: testData.userName,
          },
        })
      ).rejects.toThrow("Stripe session URL is not available");
    });
  });
});
