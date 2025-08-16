/**
 * Destination charges対応のcreateStripeSessionActionテスト
 */

import { createStripeSessionAction } from "@/app/payments/actions/create-stripe-session";
import { useDestinationCharges } from "@/lib/services/payment/feature-flags";
import { createDestinationCheckoutSession } from "@/lib/stripe/destination-charges";
import { ApplicationFeeCalculator } from "@/lib/services/fee-config/application-fee-calculator";
import { createClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";

// モック
jest.mock("@/lib/services/payment/feature-flags");
jest.mock("@/lib/stripe/destination-charges");
jest.mock("@/lib/services/fee-config/application-fee-calculator");
jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));
jest.mock("@/lib/security/secure-client-factory.impl");
jest.mock("@/lib/rate-limit");
jest.mock("@/lib/logging/app-logger", () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockUseDestinationCharges = useDestinationCharges as jest.MockedFunction<
  typeof useDestinationCharges
>;
const mockCreateDestinationCheckoutSession = createDestinationCheckoutSession as jest.MockedFunction<
  typeof createDestinationCheckoutSession
>;

describe("createStripeSessionAction - Destination charges", () => {
  let mockSupabase: any;
  let mockSecureFactory: any;

  beforeEach(() => {
    // Supabaseクライアントのモック
    mockSupabase = {
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: "user-123", email: "test@example.com" } },
          error: null,
        }),
      },
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
      limit: jest.fn().mockReturnThis(),
    };

    // SecureSupabaseClientFactoryのモック
    mockSecureFactory = {
      createAuthenticatedClient: jest.fn().mockResolvedValue(mockSupabase),
      createAuditedAdminClient: jest.fn().mockResolvedValue(mockSupabase),
    };

    const { SecureSupabaseClientFactory } = require("@/lib/security/secure-client-factory.impl");
    SecureSupabaseClientFactory.getInstance = jest.fn().mockReturnValue(mockSecureFactory);

    // Rate limitのモック
    const { createRateLimitStore, checkRateLimit } = require("@/lib/rate-limit");
    createRateLimitStore.mockResolvedValue({});
    checkRateLimit.mockResolvedValue({ allowed: true });

    // ApplicationFeeCalculatorのモック
    const mockCalculateApplicationFee = jest.fn().mockResolvedValue({
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

    (ApplicationFeeCalculator as jest.MockedClass<typeof ApplicationFeeCalculator>).mockImplementation(
      () => ({
        calculateApplicationFee: mockCalculateApplicationFee,
      } as any)
    );

    // Destination charges関連のモック
    const { createOrRetrieveCustomer } = require("@/lib/stripe/destination-charges");
    createOrRetrieveCustomer.mockResolvedValue({
      id: "cus_test123",
      email: "test@example.com",
      name: "Test User",
    });

    mockCreateDestinationCheckoutSession.mockResolvedValue({
      id: "cs_test123",
      url: "https://checkout.stripe.com/pay/cs_test123",
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const validInput = {
    attendanceId: "attendance-123",
    amount: 1000,
    successUrl: "https://example.com/success",
    cancelUrl: "https://example.com/cancel",
  };

  it("Destination chargesが有効な場合、Destination charges用のセッションを作成する", async () => {
    // 機能フラグを有効に設定
    mockUseDestinationCharges.mockReturnValue(true);

    // 参加記録とイベント情報（Stripe Connect情報付き）
    mockSupabase.select.mockReturnValueOnce(mockSupabase);
    mockSupabase.eq.mockReturnValueOnce(mockSupabase);
    mockSupabase.limit.mockReturnValueOnce(mockSupabase);
    mockSupabase.single.mockResolvedValueOnce({
      data: [
        {
          id: "attendance-123",
          events: {
            id: "event-123",
            title: "Test Event",
            fee: 1000,
            created_by: "user-123",
            stripe_connect_accounts: {
              stripe_account_id: "acct_test123",
              charges_enabled: true,
              payouts_enabled: true,
            },
          },
        },
      ],
      error: null,
    });

    // プロフィール情報
    mockSupabase.select.mockReturnValueOnce(mockSupabase);
    mockSupabase.eq.mockReturnValueOnce(mockSupabase);
    mockSupabase.single.mockResolvedValueOnce({
      data: {
        email: "test@example.com",
        display_name: "Test User",
      },
      error: null,
    });

    // PaymentValidatorのモック（validateAttendanceAccessとvalidatePaymentAmount）
    const { PaymentValidator } = require("@/lib/services/payment");
    PaymentValidator.mockImplementation(() => ({
      validateAttendanceAccess: jest.fn().mockResolvedValue(undefined),
      validatePaymentAmount: jest.fn().mockResolvedValue(undefined),
    }));

    // PaymentServiceのモック
    const { PaymentService } = require("@/lib/services/payment");
    const mockCreateStripeSession = jest.fn().mockResolvedValue({
      sessionUrl: "https://checkout.stripe.com/pay/cs_test123",
      sessionId: "cs_test123",
    });
    PaymentService.mockImplementation(() => ({
      createStripeSession: mockCreateStripeSession,
    }));

    const result = await createStripeSessionAction(validInput);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      sessionUrl: "https://checkout.stripe.com/pay/cs_test123",
      sessionId: "cs_test123",
    });

    // PaymentServiceのcreateStripeSessionがDestination charges設定で呼ばれることを確認
    expect(mockCreateStripeSession).toHaveBeenCalledWith(
      expect.objectContaining({
        attendanceId: "attendance-123",
        amount: 1000,
        eventId: "event-123",
        userId: "user-123",
        eventTitle: "Test Event",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
        transferGroup: "event_event-123_payout",
        destinationCharges: {
          destinationAccountId: "acct_test123",
          userEmail: "test@example.com",
          userName: "Test User",
          setupFutureUsage: "off_session",
        },
      })
    );
  });

  it("Destination chargesが無効な場合、従来のフローを使用する", async () => {
    // 機能フラグを無効に設定
    mockUseDestinationCharges.mockReturnValue(false);

    // 参加記録とイベント情報（Stripe Connect情報なし）
    mockSupabase.select.mockReturnValueOnce(mockSupabase);
    mockSupabase.eq.mockReturnValueOnce(mockSupabase);
    mockSupabase.limit.mockReturnValueOnce(mockSupabase);
    mockSupabase.single.mockResolvedValueOnce({
      data: [
        {
          id: "attendance-123",
          events: {
            id: "event-123",
            title: "Test Event",
            fee: 1000,
            created_by: "user-123",
            stripe_connect_accounts: null,
          },
        },
      ],
      error: null,
    });

    // PaymentValidatorのモック
    const { PaymentValidator } = require("@/lib/services/payment");
    PaymentValidator.mockImplementation(() => ({
      validateAttendanceAccess: jest.fn().mockResolvedValue(undefined),
      validatePaymentAmount: jest.fn().mockResolvedValue(undefined),
    }));

    // PaymentServiceのモック
    const { PaymentService } = require("@/lib/services/payment");
    const mockCreateStripeSession = jest.fn().mockResolvedValue({
      sessionUrl: "https://checkout.stripe.com/pay/cs_traditional123",
      sessionId: "cs_traditional123",
    });
    PaymentService.mockImplementation(() => ({
      createStripeSession: mockCreateStripeSession,
    }));

    const result = await createStripeSessionAction(validInput);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      sessionUrl: "https://checkout.stripe.com/pay/cs_traditional123",
      sessionId: "cs_traditional123",
    });

    // PaymentServiceのcreateStripeSessionがDestination charges設定なしで呼ばれることを確認
    expect(mockCreateStripeSession).toHaveBeenCalledWith(
      expect.objectContaining({
        attendanceId: "attendance-123",
        amount: 1000,
        eventId: "event-123",
        userId: "user-123",
        eventTitle: "Test Event",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
        transferGroup: "event_event-123_payout",
        destinationCharges: undefined,
      })
    );
  });

  it("Stripe Connectアカウントが設定されていない場合はエラーを返す", async () => {
    // 機能フラグを有効に設定
    mockUseDestinationCharges.mockReturnValue(true);

    // 参加記録とイベント情報（Stripe Connect情報なし）
    mockSupabase.select.mockReturnValueOnce(mockSupabase);
    mockSupabase.eq.mockReturnValueOnce(mockSupabase);
    mockSupabase.limit.mockReturnValueOnce(mockSupabase);
    mockSupabase.single.mockResolvedValueOnce({
      data: [
        {
          id: "attendance-123",
          events: {
            id: "event-123",
            title: "Test Event",
            fee: 1000,
            created_by: "user-123",
            stripe_connect_accounts: null,
          },
        },
      ],
      error: null,
    });

    // PaymentValidatorのモック
    const { PaymentValidator } = require("@/lib/services/payment");
    PaymentValidator.mockImplementation(() => ({
      validateAttendanceAccess: jest.fn().mockResolvedValue(undefined),
      validatePaymentAmount: jest.fn().mockResolvedValue(undefined),
    }));

    const result = await createStripeSessionAction(validInput);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("BUSINESS_RULE_VIOLATION");
    expect(result.error?.message).toBe("このイベントにはStripe Connectアカウントが設定されていません。");
  });

  it("Stripe Connectアカウントで決済が無効化されている場合はエラーを返す", async () => {
    // 機能フラグを有効に設定
    mockUseDestinationCharges.mockReturnValue(true);

    // 参加記録とイベント情報（charges_enabled=false）
    mockSupabase.select.mockReturnValueOnce(mockSupabase);
    mockSupabase.eq.mockReturnValueOnce(mockSupabase);
    mockSupabase.limit.mockReturnValueOnce(mockSupabase);
    mockSupabase.single.mockResolvedValueOnce({
      data: [
        {
          id: "attendance-123",
          events: {
            id: "event-123",
            title: "Test Event",
            fee: 1000,
            created_by: "user-123",
            stripe_connect_accounts: {
              stripe_account_id: "acct_test123",
              charges_enabled: false, // 決済無効
              payouts_enabled: true,
            },
          },
        },
      ],
      error: null,
    });

    // PaymentValidatorのモック
    const { PaymentValidator } = require("@/lib/services/payment");
    PaymentValidator.mockImplementation(() => ({
      validateAttendanceAccess: jest.fn().mockResolvedValue(undefined),
      validatePaymentAmount: jest.fn().mockResolvedValue(undefined),
    }));

    const result = await createStripeSessionAction(validInput);

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("BUSINESS_RULE_VIOLATION");
    expect(result.error?.message).toBe("Stripe Connectアカウントで決済が有効化されていません。");
  });

  it("プロフィール情報が取得できない場合でもユーザーのメールアドレスを使用する", async () => {
    // 機能フラグを有効に設定
    mockUseDestinationCharges.mockReturnValue(true);

    // 参加記録とイベント情報
    mockSupabase.select.mockReturnValueOnce(mockSupabase);
    mockSupabase.eq.mockReturnValueOnce(mockSupabase);
    mockSupabase.limit.mockReturnValueOnce(mockSupabase);
    mockSupabase.single.mockResolvedValueOnce({
      data: [
        {
          id: "attendance-123",
          events: {
            id: "event-123",
            title: "Test Event",
            fee: 1000,
            created_by: "user-123",
            stripe_connect_accounts: {
              stripe_account_id: "acct_test123",
              charges_enabled: true,
              payouts_enabled: true,
            },
          },
        },
      ],
      error: null,
    });

    // プロフィール情報取得失敗
    mockSupabase.select.mockReturnValueOnce(mockSupabase);
    mockSupabase.eq.mockReturnValueOnce(mockSupabase);
    mockSupabase.single.mockResolvedValueOnce({
      data: null,
      error: { message: "Profile not found" },
    });

    // PaymentValidatorのモック
    const { PaymentValidator } = require("@/lib/services/payment");
    PaymentValidator.mockImplementation(() => ({
      validateAttendanceAccess: jest.fn().mockResolvedValue(undefined),
      validatePaymentAmount: jest.fn().mockResolvedValue(undefined),
    }));

    // PaymentServiceのモック
    const { PaymentService } = require("@/lib/services/payment");
    const mockCreateStripeSession = jest.fn().mockResolvedValue({
      sessionUrl: "https://checkout.stripe.com/pay/cs_test123",
      sessionId: "cs_test123",
    });
    PaymentService.mockImplementation(() => ({
      createStripeSession: mockCreateStripeSession,
    }));

    const result = await createStripeSessionAction(validInput);

    expect(result.success).toBe(true);

    // PaymentServiceのcreateStripeSessionでユーザーのメールアドレスが使用されることを確認
    expect(mockCreateStripeSession).toHaveBeenCalledWith(
      expect.objectContaining({
        destinationCharges: {
          destinationAccountId: "acct_test123",
          userEmail: "test@example.com", // user.emailが使用される
          userName: undefined, // display_nameは取得できないのでundefined
          setupFutureUsage: "off_session",
        },
      })
    );
  });
});
