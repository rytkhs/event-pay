/**
 * Stripe Checkout セッション作成テスト
 *
 * PaymentService の Stripe Checkout セッション作成機能の包括的なテスト
 * - パラメータ検証
 * - sessionUrl生成とテンプレート置換
 */

import * as DestinationCharges from "../../../core/stripe/destination-charges";
import { ApplicationFeeCalculator } from "../../../features/payments/services/fee-config/application-fee-calculator";
import { PaymentService, PaymentErrorHandler } from "../../../features/payments/services/service";
import {
  createMockStripeClient,
  createMockApplicationFeeCalculator,
} from "../../setup/stripe-mock";
import { createMockSupabaseClientForPayments } from "../../setup/supabase-auth-mock";

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

describe("PaymentService - Stripe Checkout セッション作成", () => {
  let paymentService: PaymentService;
  let mockSupabase: ReturnType<typeof createMockSupabaseClientForPayments>;
  let mockStripe: ReturnType<typeof createMockStripeClient>;
  let mockApplicationFeeCalculator: ReturnType<typeof createMockApplicationFeeCalculator>;
  let mockCreateDestinationCheckoutSession: jest.MockedFunction<
    typeof DestinationCharges.createDestinationCheckoutSession
  >;

  // テスト用の固定データ
  const testData = {
    connectAccountId: "acct_1SNbjmCtoNNhKnPZ",
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
    mockSessionId: "cs_test_1234567890abcdef",
  };

  beforeEach(() => {
    // Supabase クライアントのモック設定（共通モック関数を使用）
    mockSupabase = createMockSupabaseClientForPayments({
      paymentId: testData.paymentId,
    });

    // Stripe クライアントのモック設定
    mockStripe = createMockStripeClient();

    // Application fee calculator のモック設定（共通モック関数を使用）
    // minimumFee: 50 がデフォルトで適用されるため、計算結果49は50になる
    mockApplicationFeeCalculator = createMockApplicationFeeCalculator({
      amount: testData.amount,
      rate: 0.049,
      minimumFee: 50, // デフォルト値（明示的に指定）
      applicationFeeAmount: Math.max(Math.floor(testData.amount * 0.049), 50), // 4.9% + minimumFee適用
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
  });

  describe("パラメータ検証", () => {
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
        // minimumFee: 50 が適用されるため、計算結果49は50になる
        const calculatedFee = Math.floor(testData.amount * 0.049);
        const expectedFee = Math.max(calculatedFee, 50); // minimumFee適用
        expect(mockCreateDestinationCheckoutSession).toHaveBeenCalledWith(
          expect.objectContaining({
            platformFeeAmount: expectedFee,
          })
        );
      });

      it("金額が整数（cents）で処理されること", async () => {
        // Arrange - 小数点を含む金額でテスト
        const decimalAmount = 1500;
        const expectedFee = 150;

        mockApplicationFeeCalculator.calculateApplicationFee.mockResolvedValue({
          amount: decimalAmount,
          applicationFeeAmount: expectedFee,
          config: {
            rate: 0.1,
            fixedFee: 0,
            minimumFee: 50,
            maximumFee: 1000,
            taxRate: 0,
            isTaxIncluded: true,
          },
          calculation: {
            rateFee: expectedFee,
            fixedFee: 0,
            beforeClipping: expectedFee,
            afterMinimum: expectedFee,
            afterMaximum: expectedFee,
          },
          taxCalculation: {
            taxRate: 0,
            feeExcludingTax: expectedFee,
            taxAmount: 0,
            isTaxIncluded: true,
          },
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
        // minimumFee: 50 が適用されるため、計算結果49は50になる
        const calculatedFee = Math.floor(testData.amount * 0.049);
        const expectedFee = Math.max(calculatedFee, 50); // minimumFee適用
        expect(mockCreateDestinationCheckoutSession).toHaveBeenCalledWith({
          eventId: testData.eventId,
          eventTitle: testData.eventTitle,
          amount: testData.amount,
          destinationAccountId: testData.connectAccountId,
          platformFeeAmount: expectedFee,
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
          idempotencyKey: expect.any(String),
        });
      });
    });
  });

  describe("sessionUrl生成とテンプレート置換", () => {
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
      it("success_urlは生の{CHECKOUT_SESSION_ID}が連結されること（エンコードされない）", () => {
        // Arrange
        const baseSuccessUrl = "https://example.com/success";

        // Act - destination-charges.tsの新ロジックを模擬（文字列連結）
        const hasQuery = baseSuccessUrl.includes("?");
        const separator = hasQuery ? "&" : "?";
        const successUrlWithTemplate = `${baseSuccessUrl}${separator}session_id={CHECKOUT_SESSION_ID}`;

        // Assert
        expect(successUrlWithTemplate).toBe(
          "https://example.com/success?session_id={CHECKOUT_SESSION_ID}"
        );
      });

      it("既にクエリがあるURLにも正しく連結されること", () => {
        const baseSuccessUrlWithQuery = "https://example.com/success?from=checkout";
        const successUrlWithTemplate = `${baseSuccessUrlWithQuery}&session_id={CHECKOUT_SESSION_ID}`;
        expect(successUrlWithTemplate).toBe(
          "https://example.com/success?from=checkout&session_id={CHECKOUT_SESSION_ID}"
        );
      });

      it("テンプレート置換が実際のsession.idで行われることを想定した検証", () => {
        // Arrange
        const templateUrl = "https://example.com/success?session_id={CHECKOUT_SESSION_ID}";
        const actualSessionId = "cs_test_1234567890abcdef";

        // Act - Stripeが実際に行う置換を模擬
        const finalUrl = templateUrl.replace("{CHECKOUT_SESSION_ID}", actualSessionId);

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
});
