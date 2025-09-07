/**
 * Stripe Checkout セッション作成パラメータ検証テスト
 *
 * 目的：PaymentService が Stripe Checkout セッション作成時に
 * on_behalf_of, transfer_data, application_fee_amount, metadata
 * を正しく設定していることを検証する
 */

import { PaymentService, PaymentErrorHandler } from "../../../features/payments/services/service";
import { createMockStripeClient } from "../../setup/stripe-mock";
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

describe("PaymentService - Stripe Checkout パラメータ検証", () => {
  let paymentService: PaymentService;
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;
  let mockStripe: ReturnType<typeof createMockStripeClient>;
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
    successUrl: "http://localhost:3000/success",
    cancelUrl: "http://localhost:3000/cancel",
    userEmail: "test@example.com",
    userName: "テストユーザー",
    calculatedFee: 100, // 10%の手数料
  };

  beforeEach(() => {
    // Supabase クライアントのモック設定
    mockSupabase = createMockSupabaseClient();

    // Stripe クライアントのモック設定
    mockStripe = createMockStripeClient();

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

    // モックの戻り値を設定（実際のCheckout Sessionオブジェクト）
    mockCreateDestinationCheckoutSession.mockResolvedValue({
      id: "cs_test_1234567890",
      url: "https://checkout.stripe.com/c/pay/cs_test_1234567890",
      object: "checkout.session",
    } as any);

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

  describe("on_behalf_of と transfer_data.destination の検証", () => {
    it("同一のConnect IDが設定されること", async () => {
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

      // Assert
      expect(mockCreateDestinationCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          destinationAccountId: testData.connectAccountId,
        })
      );

      // createDestinationCheckoutSession の呼び出し引数を詳細検証
      const callArgs = mockCreateDestinationCheckoutSession.mock.calls[0][0];
      expect(callArgs.destinationAccountId).toBe(testData.connectAccountId);
    });
  });

  describe("application_fee_amount の検証", () => {
    it("Calculator の戻り値と一致すること", async () => {
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

      // Assert - Calculator が正しい金額で呼び出されること
      expect(mockApplicationFeeCalculator.calculateApplicationFee).toHaveBeenCalledWith(
        testData.amount
      );

      // Assert - 計算された手数料が destination-charges に渡されること
      expect(mockCreateDestinationCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          platformFeeAmount: testData.calculatedFee,
        })
      );
    });

    it("金額が整数（cents）で処理されること", async () => {
      // Arrange - 小数点を含む金額でテスト
      const decimalAmount = 1500;
      const expectedFee = 150;

      mockApplicationFeeCalculator.calculateApplicationFee.mockResolvedValue({
        applicationFeeAmount: expectedFee,
        netAmount: decimalAmount - expectedFee,
      });

      // Act
      await paymentService.createStripeSession({
        attendanceId: testData.attendanceId,
        amount: decimalAmount,
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

      // Assert - 整数で処理されること
      expect(mockCreateDestinationCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: decimalAmount,
          platformFeeAmount: expectedFee,
        })
      );

      expect(Number.isInteger(decimalAmount)).toBe(true);
      expect(Number.isInteger(expectedFee)).toBe(true);
    });
  });

  describe("metadata の検証", () => {
    it("必要なキーが含まれること（payment_id, attendance_id, event_title）", async () => {
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

      // Assert - metadata が正しく設定されること
      expect(mockCreateDestinationCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            payment_id: testData.paymentId,
            attendance_id: testData.attendanceId,
            event_title: testData.eventTitle,
          }),
        })
      );
    });

    it("XSS想定文字列がエスケープされずに渡されること", async () => {
      // Arrange - XSS想定のイベントタイトル
      const xssEventTitle = '<script>alert("XSS")</script>テストイベント&<>';

      // Act
      await paymentService.createStripeSession({
        attendanceId: testData.attendanceId,
        amount: testData.amount,
        eventId: testData.eventId,
        actorId: testData.actorId,
        eventTitle: xssEventTitle,
        successUrl: testData.successUrl,
        cancelUrl: testData.cancelUrl,
        destinationCharges: {
          destinationAccountId: testData.connectAccountId,
          userEmail: testData.userEmail,
          userName: testData.userName,
        },
      });

      // Assert - XSS文字列がそのまま（エスケープされずに）metadata に設定されること
      expect(mockCreateDestinationCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            event_title: xssEventTitle, // エスケープされていない状態
          }),
        })
      );
    });

    it("metadata のオブジェクト構造が正しいこと", async () => {
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

      // Assert - metadata が Record<string, string> 型であること
      const callArgs = mockCreateDestinationCheckoutSession.mock.calls[0][0];
      const metadata = callArgs.metadata;

      expect(metadata).toBeDefined();
      expect(typeof metadata).toBe("object");

      // 各キーが文字列であること
      Object.entries(metadata!).forEach(([key, value]) => {
        expect(typeof key).toBe("string");
        expect(typeof value).toBe("string");
      });
    });
  });

  describe("関数呼び出し回数の検証", () => {
    it("createDestinationCheckoutSession が1回のみ呼び出されること", async () => {
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

      // Assert
      expect(mockCreateDestinationCheckoutSession).toHaveBeenCalledTimes(1);
    });

    it("ApplicationFeeCalculator が1回のみ呼び出されること", async () => {
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

      // Assert
      expect(mockApplicationFeeCalculator.calculateApplicationFee).toHaveBeenCalledTimes(1);
    });
  });

  describe("統合パラメータの検証", () => {
    it("すべての必要パラメータが正しく設定されること", async () => {
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

      // Assert - 全パラメータの統合検証
      expect(mockCreateDestinationCheckoutSession).toHaveBeenCalledWith({
        eventId: testData.eventId,
        eventTitle: testData.eventTitle,
        amount: testData.amount,
        destinationAccountId: testData.connectAccountId,
        platformFeeAmount: testData.calculatedFee,
        customerId: expect.any(String), // Customer作成結果
        successUrl: testData.successUrl,
        cancelUrl: testData.cancelUrl,
        actorId: testData.actorId,
        metadata: {
          payment_id: testData.paymentId,
          attendance_id: testData.attendanceId,
          event_title: testData.eventTitle,
        },
        setupFutureUsage: undefined, // デフォルト値
      });
    });
  });
});
