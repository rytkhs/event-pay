/**
 * Guest Session Creation: エラーケーステスト
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";

import { createGuestStripeSessionAction } from "../../../../features/guest/actions/create-stripe-session";

import {
  setupGuestSessionCreationTest,
  setupBeforeEach,
  cleanupAfterAll,
  type GuestSessionCreationTestContext,
} from "./guest-session-creation-test-setup";

describe("エラーケース", () => {
  let context: GuestSessionCreationTestContext;

  beforeAll(async () => {
    context = await setupGuestSessionCreationTest();
  });

  afterAll(async () => {
    await cleanupAfterAll(context);
  });

  beforeEach(() => {
    setupBeforeEach(context);
  });

  it.skip("無効なゲストトークンの場合はUNAUTHORIZEDエラーを返す", async () => {
    const input = {
      guestToken: context.testAttendance.guest_token, // 有効な長さだが無効な内容
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
    };

    context.mockValidateGuestToken.mockResolvedValue({
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

  it.skip("決済許可条件を満たさない場合はRESOURCE_CONFLICTエラーを返す", async () => {
    const input = {
      guestToken: context.testAttendance.guest_token,
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
    };

    context.mockValidateGuestToken.mockResolvedValue({
      isValid: true,
      attendance: {
        id: context.testAttendance.id,
        email: "test-guest@example.com",
        nickname: "テストゲスト",
        status: "attending",
        guest_token: context.testAttendance.guest_token,
        created_at: "2025-01-01T10:00:00Z",
        updated_at: "2025-01-01T10:00:00Z",
        event: {
          id: context.testEvent.id,
          title: "テストイベント",
          description: null,
          date: context.testEvent.date,
          location: null,
          fee: 1000,
          capacity: null,
          registration_deadline: null,
          payment_deadline: "2024-01-01T00:00:00Z", // 過去の日付
          allow_payment_after_deadline: false,
          grace_period_days: 0,
          created_by: context.testUser.id,
        },
        payment: null,
      },
      canModify: true,
    });

    context.mockCanCreateStripeSession.mockReturnValue({
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

  it.skip("レート制限に達した場合はRATE_LIMITEDエラーを返す", async () => {
    const input = {
      guestToken: context.testAttendance.guest_token,
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
    };

    context.mockValidateGuestToken.mockResolvedValue({
      isValid: true,
      attendance: {
        id: context.testAttendance.id,
        email: "test-guest@example.com",
        nickname: "テストゲスト",
        status: "attending",
        guest_token: context.testAttendance.guest_token,
        created_at: "2025-01-01T10:00:00Z",
        updated_at: "2025-01-01T10:00:00Z",
        event: {
          id: context.testEvent.id,
          title: "テストイベント",
          description: null,
          date: context.testEvent.date,
          location: null,
          fee: 1000,
          capacity: null,
          registration_deadline: null,
          payment_deadline: context.testEvent.date,
          allow_payment_after_deadline: false,
          grace_period_days: 0,
          created_by: context.testUser.id,
        },
        payment: null,
      },
      canModify: true,
    });

    context.mockCanCreateStripeSession.mockReturnValue({
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

    context.mockBuildKey.mockReturnValue("RL:payment.createSession:attendance:test-attendance-id");
    context.mockEnforceRateLimit.mockResolvedValue({
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

  it.skip("Connect アカウントが存在しない場合はRESOURCE_CONFLICTエラーを返す", async () => {
    const input = {
      guestToken: context.testAttendance.guest_token,
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
    };

    context.mockValidateGuestToken.mockResolvedValue({
      isValid: true,
      attendance: {
        id: context.testAttendance.id,
        email: "test-guest@example.com",
        nickname: "テストゲスト",
        status: "attending",
        guest_token: context.testAttendance.guest_token,
        created_at: "2025-01-01T10:00:00Z",
        updated_at: "2025-01-01T10:00:00Z",
        event: {
          id: context.testEvent.id,
          title: "テストイベント",
          description: null,
          date: context.testEvent.date,
          location: null,
          fee: 1000,
          capacity: null,
          registration_deadline: null,
          payment_deadline: context.testEvent.date,
          allow_payment_after_deadline: false,
          grace_period_days: 0,
          created_by: context.testUser.id,
        },
        payment: null,
      },
      canModify: true,
    });

    context.mockCanCreateStripeSession.mockReturnValue({
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

    context.mockBuildKey.mockReturnValue("RL:payment.createSession:attendance:test-attendance-id");
    context.mockEnforceRateLimit.mockResolvedValue({
      allowed: true,
      retryAfter: undefined,
      remaining: 2,
    });

    // 既存決済レコードなし
    context.mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    // Connect アカウントが存在しない
    context.mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
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

  it.skip("payouts_enabledがfalseの場合はRESOURCE_CONFLICTエラーを返す", async () => {
    const input = {
      guestToken: context.testAttendance.guest_token,
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
    };

    context.mockValidateGuestToken.mockResolvedValue({
      isValid: true,
      attendance: {
        id: context.testAttendance.id,
        email: "test-guest@example.com",
        nickname: "テストゲスト",
        status: "attending",
        guest_token: context.testAttendance.guest_token,
        created_at: "2025-01-01T10:00:00Z",
        updated_at: "2025-01-01T10:00:00Z",
        event: {
          id: context.testEvent.id,
          title: "テストイベント",
          description: null,
          date: context.testEvent.date,
          location: null,
          fee: 1000,
          capacity: null,
          registration_deadline: null,
          payment_deadline: context.testEvent.date,
          allow_payment_after_deadline: false,
          grace_period_days: 0,
          created_by: context.testUser.id,
        },
        payment: null,
      },
      canModify: true,
    });

    context.mockCanCreateStripeSession.mockReturnValue({
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

    context.mockBuildKey.mockReturnValue("RL:payment.createSession:attendance:test-attendance-id");
    context.mockEnforceRateLimit.mockResolvedValue({
      allowed: true,
      retryAfter: undefined,
      remaining: 2,
    });

    // 既存決済レコードなし
    context.mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    // payouts_enabledがfalse
    context.mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
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
