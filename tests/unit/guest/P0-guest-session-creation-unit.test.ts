/**
 * P0決済セッション作成（正常系: ゲスト）ユニットテスト
 *
 * 仕様書: docs/spec/test/stripe/P0-guest-session-creation-spec.md
 *
 * 目的：
 * ゲストユーザーがイベントの決済を行うためのStripe Checkoutセッション作成機能の
 * ユニットテストを実行し、仕様書に記載された期待値を厳密に検証する。
 *
 * ユニットテスト特徴：
 * - ❌ 全外部依存をモック化
 * - ✅ 高速実行・予測可能なテスト
 * - ✅ 仕様書ベースの期待値検証
 * - ✅ パラメータ・ロジックの詳細検証
 *
 * 重要：
 * - プロダクションコードの実装に合わせてテストの期待値を変更しない
 * - テストの期待値は「仕様書」に基づいて設定する
 * - プロダクションコードが仕様書と異なる場合、テストを失敗させる
 */

import { jest } from "@jest/globals";

import { enforceRateLimit, buildKey, POLICIES } from "../../../core/rate-limit";
import { SecureSupabaseClientFactory } from "../../../core/security/secure-client-factory.impl";
import * as DestinationCharges from "../../../core/stripe/destination-charges";
import { validateGuestToken } from "../../../core/utils/guest-token";
import { canCreateStripeSession } from "../../../core/validation/payment-eligibility";
import { createGuestStripeSessionAction } from "../../../features/guest/actions/create-stripe-session";
import { ApplicationFeeCalculator } from "../../../features/payments/services/fee-config/application-fee-calculator";
import {
  createTestUserWithConnect,
  createPaidTestEvent,
  createTestAttendance,
  cleanupTestPaymentData,
  type TestPaymentUser,
  type TestPaymentEvent,
  type TestAttendanceData,
} from "../../helpers/test-payment-data";

// モック設定
jest.mock("../../../core/utils/guest-token");
jest.mock("../../../core/validation/payment-eligibility");
jest.mock("../../../core/rate-limit");
jest.mock("../../../core/stripe/destination-charges");
jest.mock("../../../features/payments/services/fee-config/application-fee-calculator");
jest.mock("../../../features/payments/core-bindings");

describe("P0決済セッション作成（正常系: ゲスト）ユニットテスト", () => {
  // テストデータ
  let testUser: TestPaymentUser;
  let testEvent: TestPaymentEvent;
  let testAttendance: TestAttendanceData;

  // モック
  let mockValidateGuestToken: jest.MockedFunction<typeof validateGuestToken>;
  let mockCanCreateStripeSession: jest.MockedFunction<typeof canCreateStripeSession>;
  let mockEnforceRateLimit: jest.MockedFunction<typeof enforceRateLimit>;
  let mockBuildKey: jest.MockedFunction<typeof buildKey>;
  let mockCreateDestinationCheckoutSession: jest.MockedFunction<
    typeof DestinationCharges.createDestinationCheckoutSession
  >;
  let mockCreateOrRetrieveCustomer: jest.MockedFunction<
    typeof DestinationCharges.createOrRetrieveCustomer
  >;
  let mockApplicationFeeCalculator: jest.Mocked<ApplicationFeeCalculator>;

  // Supabaseクライアントのモック
  let mockSupabaseClient: any;

  beforeAll(async () => {
    // テストデータセットアップ
    testUser = await createTestUserWithConnect(
      `test-organizer-${Date.now()}@example.com`,
      "TestPassword123!",
      {
        stripeAccountId: "acct_test123456789", // 仕様書通りのアカウントID
        payoutsEnabled: true,
        chargesEnabled: true,
      }
    );

    testEvent = await createPaidTestEvent(testUser.id, {
      fee: 1000, // 仕様書通りの金額
      title: "テストイベント", // 仕様書通りのタイトル
    });

    testAttendance = await createTestAttendance(testEvent.id, {
      email: "test-guest@example.com", // 仕様書通りのメールアドレス
      nickname: "テストゲスト", // 仕様書通りのニックネーム
      status: "attending",
      // 実際に生成された36文字トークンを使用（仕様書の固定値は使わない）
    });
  });

  afterAll(async () => {
    // テストデータクリーンアップ
    await cleanupTestPaymentData({
      attendanceIds: [testAttendance.id],
      eventIds: [testEvent.id],
      userIds: [testUser.id],
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // モックの基本設定
    mockValidateGuestToken = validateGuestToken as jest.MockedFunction<typeof validateGuestToken>;
    mockCanCreateStripeSession = canCreateStripeSession as jest.MockedFunction<
      typeof canCreateStripeSession
    >;
    mockEnforceRateLimit = enforceRateLimit as jest.MockedFunction<typeof enforceRateLimit>;
    mockBuildKey = buildKey as jest.MockedFunction<typeof buildKey>;
    mockCreateDestinationCheckoutSession =
      DestinationCharges.createDestinationCheckoutSession as jest.MockedFunction<
        typeof DestinationCharges.createDestinationCheckoutSession
      >;
    mockCreateOrRetrieveCustomer =
      DestinationCharges.createOrRetrieveCustomer as jest.MockedFunction<
        typeof DestinationCharges.createOrRetrieveCustomer
      >;

    // ApplicationFeeCalculatorのモック
    mockApplicationFeeCalculator = {
      calculateApplicationFee: jest.fn(),
    } as any;
    (
      ApplicationFeeCalculator as jest.MockedClass<typeof ApplicationFeeCalculator>
    ).mockImplementation(() => mockApplicationFeeCalculator);

    // Supabaseクライアントのモック
    mockSupabaseClient = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
      maybeSingle: jest.fn(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
    };

    // SecureSupabaseClientFactory のモック
    jest.spyOn(SecureSupabaseClientFactory, "getInstance").mockReturnValue({
      createGuestClient: jest.fn().mockReturnValue(mockSupabaseClient),
    } as any);
  });

  describe("仕様書通りの正常系フロー", () => {
    it.skip("すべての処理が仕様書の期待値通りに実行される", async () => {
      // === 仕様書: 入力パラメータ ===
      const input = {
        guestToken: testAttendance.guest_token, // 実際に生成された36文字トークン
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      };

      // === 仕様書: 2. ゲストトークン検証 ===
      mockValidateGuestToken.mockResolvedValue({
        isValid: true,
        attendance: {
          id: testAttendance.id,
          email: "test-guest@example.com",
          nickname: "テストゲスト",
          status: "attending",
          guest_token: testAttendance.guest_token,
          created_at: "2025-01-01T10:00:00Z",
          updated_at: "2025-01-01T10:00:00Z",
          event: {
            id: testEvent.id,
            title: "テストイベント",
            description: null,
            date: testEvent.date,
            location: null,
            fee: 1000,
            capacity: null,
            registration_deadline: null,
            payment_deadline: testEvent.date,
            allow_payment_after_deadline: false,
            grace_period_days: 0,
            created_by: testUser.id,
          },
          payment: null,
        },
        canModify: true,
      });

      // === 仕様書: 3. 決済許可条件チェック ===
      mockCanCreateStripeSession.mockReturnValue({
        isEligible: true,
        reason: undefined,
        checks: {
          isAttending: true,
          isPaidEvent: true,
          isUpcomingEvent: true,
          isBeforeDeadline: true,
          isValidPaymentMethod: true,
          isValidPaymentStatus: true,
        },
      });

      // === 仕様書: 4. レート制限チェック ===
      mockBuildKey.mockReturnValue("RL:payment.createSession:attendance:test-attendance-id");
      mockEnforceRateLimit.mockResolvedValue({
        allowed: true,
        retryAfter: undefined,
        remaining: 2,
      });

      // === 仕様書: 7.1. 既存決済レコード処理 ===
      // 既存決済レコードなし
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: null, error: null }); // payments検索（既存決済なし）

      // === 仕様書: 5.2. Connect アカウント検証 ===
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
        data: {
          stripe_account_id: "acct_test123456789",
          payouts_enabled: true,
        },
        error: null,
      });

      // === 仕様書: 7.2. 決済レコード作成 ===
      const mockPaymentId = "generated-payment-id";
      mockSupabaseClient.single.mockResolvedValueOnce({
        data: {
          id: mockPaymentId,
          attendance_id: testAttendance.id,
          method: "stripe",
          amount: 1000,
          status: "pending",
        },
        error: null,
      });

      // === 仕様書: 7.3. Application Fee 計算 ===
      mockApplicationFeeCalculator.calculateApplicationFee.mockResolvedValue({
        amount: 1000,
        applicationFeeAmount: 100, // max(round(1000 * 0.05) + 50, 100) = 100
        config: {
          rate: 0.05,
          fixedFee: 50,
          minimumFee: 100,
          maximumFee: 0,
          taxRate: 0,
          isTaxIncluded: true,
        },
        calculation: {
          rateFee: 50,
          fixedFee: 50,
          beforeClipping: 100,
          afterMinimum: 100,
          afterMaximum: 100,
        },
        taxCalculation: {
          taxRate: 0,
          feeExcludingTax: 100,
          taxAmount: 0,
          isTaxIncluded: true,
        },
      });

      // === 仕様書: 7.4. Stripe Customer 作成/取得 ===
      const mockCustomerId = "cus_test123456789";
      mockCreateOrRetrieveCustomer.mockResolvedValue({
        id: mockCustomerId,
        email: "test-guest@example.com",
        metadata: {
          actor_id: testAttendance.id,
          event_id: testEvent.id,
        },
      } as any);

      // === 仕様書: 7.5. Checkout Session 作成 ===
      const mockSessionId = "cs_test_xxxxxxxxxx";
      const mockSessionUrl =
        "https://checkout.stripe.com/pay/cs_test_xxxxxxxxxx#fidkdWxOYHwnPyd1blpxYHZxWjA0S...";
      mockCreateDestinationCheckoutSession.mockResolvedValue({
        id: mockSessionId,
        url: mockSessionUrl,
      } as any);

      // === 仕様書: 7.6. 決済レコード更新 ===
      mockSupabaseClient.update = jest.fn().mockReturnThis();
      mockSupabaseClient.eq = jest.fn().mockReturnValue({ error: null, data: {} });

      // === 実行 ===
      const result = await createGuestStripeSessionAction(input);

      // === 仕様書: 期待結果の検証 ===

      // 1. 入力検証が正しく行われること
      expect(mockValidateGuestToken).toHaveBeenCalledWith(testAttendance.guest_token);

      // 2. ゲストトークン検証の結果が正しく使用されること
      expect(mockValidateGuestToken).toHaveBeenCalledTimes(1);

      // 3. 決済許可条件チェックが正しく行われること
      expect(mockCanCreateStripeSession).toHaveBeenCalledWith(
        expect.objectContaining({
          id: testAttendance.id,
          status: "attending",
        }),
        expect.objectContaining({
          id: testEvent.id,
          fee: 1000,
        })
      );

      // 4. レート制限チェックが正しく行われること
      expect(mockBuildKey).toHaveBeenCalledWith({
        scope: "payment.createSession",
        attendanceId: testAttendance.id,
      });
      expect(mockEnforceRateLimit).toHaveBeenCalledWith({
        keys: ["RL:payment.createSession:attendance:test-attendance-id"],
        policy: POLICIES["payment.createSession"],
      });

      // 5. Application Fee計算が正しく行われること
      expect(mockApplicationFeeCalculator.calculateApplicationFee).toHaveBeenCalledWith(1000);

      // 6. Stripe Customer作成が正しいパラメータで行われること
      expect(mockCreateOrRetrieveCustomer).toHaveBeenCalledWith({
        email: "test-guest@example.com",
        name: "テストゲスト",
        metadata: {
          actor_id: testAttendance.id,
          event_id: testEvent.id,
        },
      });

      // 7. Checkout Session作成が正しいパラメータで行われること
      expect(mockCreateDestinationCheckoutSession).toHaveBeenCalledWith({
        eventId: testEvent.id,
        eventTitle: "テストイベント",
        amount: 1000,
        destinationAccountId: "acct_test123456789",
        platformFeeAmount: 100,
        customerId: mockCustomerId,
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
        actorId: testAttendance.id,
        metadata: {
          payment_id: mockPaymentId,
          attendance_id: testAttendance.id,
          event_title: "テストイベント",
        },
        idempotencyKey: expect.any(String),
      });

      // 8. 決済レコード更新が正しく行われること
      expect(mockSupabaseClient.update).toHaveBeenCalledWith({
        stripe_checkout_session_id: mockSessionId,
        destination_account_id: "acct_test123456789",
        application_fee_amount: 100,
        transfer_group: `event_${testEvent.id}_payout`,
        stripe_customer_id: mockCustomerId,
        checkout_idempotency_key: expect.any(String),
        checkout_key_revision: 0,
      });

      // 9. 成功レスポンスが仕様書通りであること
      expect(result).toEqual({
        success: true,
        data: {
          sessionUrl: mockSessionUrl,
          sessionId: mockSessionId,
        },
      });
    });
  });

  describe("エラーケース", () => {
    it("無効なゲストトークンの場合はUNAUTHORIZEDエラーを返す", async () => {
      const input = {
        guestToken: testAttendance.guest_token, // 有効な長さだが無効な内容
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      };

      mockValidateGuestToken.mockResolvedValue({
        isValid: false,
        attendance: undefined,
        canModify: false,
        errorMessage: "無効なゲストトークンです",
      });

      const result = await createGuestStripeSessionAction(input);

      expect(result).toEqual({
        success: false,
        code: "UNAUTHORIZED",
        error: "無効なゲストトークンです",
        correlationId: expect.any(String),
        retryable: false,
      });
    });

    it("決済許可条件を満たさない場合はRESOURCE_CONFLICTエラーを返す", async () => {
      const input = {
        guestToken: testAttendance.guest_token,
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      };

      mockValidateGuestToken.mockResolvedValue({
        isValid: true,
        attendance: {
          id: testAttendance.id,
          email: "test-guest@example.com",
          nickname: "テストゲスト",
          status: "attending",
          guest_token: testAttendance.guest_token,
          created_at: "2025-01-01T10:00:00Z",
          updated_at: "2025-01-01T10:00:00Z",
          event: {
            id: testEvent.id,
            title: "テストイベント",
            description: null,
            date: testEvent.date,
            location: null,
            fee: 1000,
            capacity: null,
            registration_deadline: null,
            payment_deadline: "2024-01-01T00:00:00Z", // 過去の日付
            allow_payment_after_deadline: false,
            grace_period_days: 0,
            created_by: testUser.id,
          },
          payment: null,
        },
        canModify: true,
      });

      mockCanCreateStripeSession.mockReturnValue({
        isEligible: false,
        reason: "決済期限を過ぎています",
        checks: {
          isAttending: true,
          isPaidEvent: true,
          isUpcomingEvent: true,
          isBeforeDeadline: false, // 期限切れ
          isValidPaymentMethod: true,
          isValidPaymentStatus: true,
        },
      });

      const result = await createGuestStripeSessionAction(input);

      expect(result).toEqual({
        success: false,
        code: "RESOURCE_CONFLICT",
        error: "決済期限を過ぎています",
        correlationId: expect.any(String),
        retryable: false,
      });
    });

    it("レート制限に達した場合はRATE_LIMITEDエラーを返す", async () => {
      const input = {
        guestToken: testAttendance.guest_token,
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      };

      mockValidateGuestToken.mockResolvedValue({
        isValid: true,
        attendance: {
          id: testAttendance.id,
          email: "test-guest@example.com",
          nickname: "テストゲスト",
          status: "attending",
          guest_token: testAttendance.guest_token,
          created_at: "2025-01-01T10:00:00Z",
          updated_at: "2025-01-01T10:00:00Z",
          event: {
            id: testEvent.id,
            title: "テストイベント",
            description: null,
            date: testEvent.date,
            location: null,
            fee: 1000,
            capacity: null,
            registration_deadline: null,
            payment_deadline: testEvent.date,
            allow_payment_after_deadline: false,
            grace_period_days: 0,
            created_by: testUser.id,
          },
          payment: null,
        },
        canModify: true,
      });

      mockCanCreateStripeSession.mockReturnValue({
        isEligible: true,
        reason: undefined,
        checks: {
          isAttending: true,
          isPaidEvent: true,
          isUpcomingEvent: true,
          isBeforeDeadline: true,
          isValidPaymentMethod: true,
          isValidPaymentStatus: true,
        },
      });

      mockBuildKey.mockReturnValue("RL:payment.createSession:attendance:test-attendance-id");
      mockEnforceRateLimit.mockResolvedValue({
        allowed: false,
        remaining: 0,
        retryAfter: 20,
      });

      const result = await createGuestStripeSessionAction(input);

      expect(result).toEqual({
        success: false,
        code: "RATE_LIMITED",
        error:
          "Stripe Checkout セッションの作成回数が上限に達しました。しばらく待ってから再試行してください。",
        retryable: true,
        details: { retryAfter: 20 },
        correlationId: expect.any(String),
      });
    });

    it("Connect アカウントが存在しない場合はRESOURCE_CONFLICTエラーを返す", async () => {
      const input = {
        guestToken: testAttendance.guest_token,
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      };

      mockValidateGuestToken.mockResolvedValue({
        isValid: true,
        attendance: {
          id: testAttendance.id,
          email: "test-guest@example.com",
          nickname: "テストゲスト",
          status: "attending",
          guest_token: testAttendance.guest_token,
          created_at: "2025-01-01T10:00:00Z",
          updated_at: "2025-01-01T10:00:00Z",
          event: {
            id: testEvent.id,
            title: "テストイベント",
            description: null,
            date: testEvent.date,
            location: null,
            fee: 1000,
            capacity: null,
            registration_deadline: null,
            payment_deadline: testEvent.date,
            allow_payment_after_deadline: false,
            grace_period_days: 0,
            created_by: testUser.id,
          },
          payment: null,
        },
        canModify: true,
      });

      mockCanCreateStripeSession.mockReturnValue({
        isEligible: true,
        reason: undefined,
        checks: {
          isAttending: true,
          isPaidEvent: true,
          isUpcomingEvent: true,
          isBeforeDeadline: true,
          isValidPaymentMethod: true,
          isValidPaymentStatus: true,
        },
      });

      mockBuildKey.mockReturnValue("RL:payment.createSession:attendance:test-attendance-id");
      mockEnforceRateLimit.mockResolvedValue({
        allowed: true,
        retryAfter: undefined,
        remaining: 2,
      });

      // 既存決済レコードなし
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

      // Connect アカウントが存在しない
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      const result = await createGuestStripeSessionAction(input);

      expect(result).toEqual({
        success: false,
        code: "RESOURCE_CONFLICT",
        error:
          "決済の準備ができません。主催者のお支払い受付設定に不備があります。現金決済をご利用いただくか、主催者にお問い合わせください。",
        correlationId: expect.any(String),
        retryable: false,
      });
    });

    it("payouts_enabledがfalseの場合はRESOURCE_CONFLICTエラーを返す", async () => {
      const input = {
        guestToken: testAttendance.guest_token,
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      };

      mockValidateGuestToken.mockResolvedValue({
        isValid: true,
        attendance: {
          id: testAttendance.id,
          email: "test-guest@example.com",
          nickname: "テストゲスト",
          status: "attending",
          guest_token: testAttendance.guest_token,
          created_at: "2025-01-01T10:00:00Z",
          updated_at: "2025-01-01T10:00:00Z",
          event: {
            id: testEvent.id,
            title: "テストイベント",
            description: null,
            date: testEvent.date,
            location: null,
            fee: 1000,
            capacity: null,
            registration_deadline: null,
            payment_deadline: testEvent.date,
            allow_payment_after_deadline: false,
            grace_period_days: 0,
            created_by: testUser.id,
          },
          payment: null,
        },
        canModify: true,
      });

      mockCanCreateStripeSession.mockReturnValue({
        isEligible: true,
        reason: undefined,
        checks: {
          isAttending: true,
          isPaidEvent: true,
          isUpcomingEvent: true,
          isBeforeDeadline: true,
          isValidPaymentMethod: true,
          isValidPaymentStatus: true,
        },
      });

      mockBuildKey.mockReturnValue("RL:payment.createSession:attendance:test-attendance-id");
      mockEnforceRateLimit.mockResolvedValue({
        allowed: true,
        retryAfter: undefined,
        remaining: 2,
      });

      // 既存決済レコードなし
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

      // payouts_enabledがfalse
      mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
        data: {
          stripe_account_id: "acct_test123456789",
          payouts_enabled: false,
        },
        error: null,
      });

      const result = await createGuestStripeSessionAction(input);

      expect(result).toEqual({
        success: false,
        code: "RESOURCE_CONFLICT",
        error:
          "主催者のお支払い受付が一時的に制限されています。現金決済をご利用いただくか、主催者にお問い合わせください。",
        correlationId: expect.any(String),
        retryable: false,
      });
    });
  });

  describe("入力検証", () => {
    it("guestTokenが36文字未満の場合はVALIDATION_ERRORを返す", async () => {
      const input = {
        guestToken: "short_token", // 36文字未満
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      };

      const result = await createGuestStripeSessionAction(input);

      expect(result).toEqual({
        success: false,
        code: "VALIDATION_ERROR",
        error: "入力データが無効です。",
        details: {
          zodErrors: expect.arrayContaining([
            expect.objectContaining({
              path: ["guestToken"],
              message: "ゲストトークンが無効です",
            }),
          ]),
        },
        correlationId: expect.any(String),
        fieldErrors: undefined,
        retryable: false,
      });
    });

    it("successUrlが無効なURL形式の場合はVALIDATION_ERRORを返す", async () => {
      const input = {
        guestToken: testAttendance.guest_token,
        successUrl: "invalid-url", // 無効なURL
        cancelUrl: "https://example.com/cancel",
      };

      const result = await createGuestStripeSessionAction(input);

      expect(result).toEqual({
        success: false,
        code: "VALIDATION_ERROR",
        error: "入力データが無効です。",
        details: {
          zodErrors: expect.arrayContaining([
            expect.objectContaining({
              path: ["successUrl"],
              code: "invalid_string",
              validation: "url",
            }),
          ]),
        },
        correlationId: expect.any(String),
        fieldErrors: undefined,
        retryable: false,
      });
    });

    it("cancelUrlが無効なURL形式の場合はVALIDATION_ERRORを返す", async () => {
      const input = {
        guestToken: testAttendance.guest_token,
        successUrl: "https://example.com/success",
        cancelUrl: "invalid-url", // 無効なURL
      };

      const result = await createGuestStripeSessionAction(input);

      expect(result).toEqual({
        success: false,
        code: "VALIDATION_ERROR",
        error: "入力データが無効です。",
        details: {
          zodErrors: expect.arrayContaining([
            expect.objectContaining({
              path: ["cancelUrl"],
              code: "invalid_string",
              validation: "url",
            }),
          ]),
        },
        correlationId: expect.any(String),
        fieldErrors: undefined,
        retryable: false,
      });
    });
  });
});
