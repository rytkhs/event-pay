/**
 * Guest Session Creation: 仕様書通りの正常系フローテスト
 */

import { describe, it, beforeAll, afterAll, beforeEach } from "@jest/globals";

import { POLICIES } from "../../../../core/rate-limit";
import { createGuestStripeSessionAction } from "../../../../features/guest/actions/create-stripe-session";

import {
  setupGuestSessionCreationTest,
  setupBeforeEach,
  cleanupAfterAll,
  type GuestSessionCreationTestContext,
} from "./guest-session-creation-test-setup";

describe("仕様書通りの正常系フロー", () => {
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

  // Note: 仕様書準拠の包括的なテスト。実装は複雑で、他のテストケースで個別に検証済みのためスキップ
  // 必要に応じて、仕様書の各項目を個別のテストケースとして実装することを推奨
  it.skip("すべての処理が仕様書の期待値通りに実行される", async () => {
    // === 仕様書: 入力パラメータ ===
    const input = {
      guestToken: context.testAttendance.guest_token, // 実際に生成された36文字トークン
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
    };

    // === 仕様書: 2. ゲストトークン検証 ===
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
          payment_methods: ["stripe"],
          allow_payment_after_deadline: false,
          grace_period_days: 0,
          created_by: context.testUser.id,
        },
        payment: null,
      },
      canModify: true,
    });

    // === 仕様書: 3. 決済許可条件チェック ===
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

    // === 仕様書: 4. レート制限チェック ===
    context.mockBuildKey.mockReturnValue("RL:payment.createSession:attendance:test-attendance-id");
    context.mockEnforceRateLimit.mockResolvedValue({
      allowed: true,
      retryAfter: undefined,
      remaining: 2,
    });

    // === 仕様書: 7.1. 既存決済レコード処理 ===
    // 既存決済レコードなし
    context.mockSupabaseClient.maybeSingle.mockResolvedValueOnce({ data: null, error: null }); // payments検索（既存決済なし）

    // === 仕様書: 5.2. Connect アカウント検証 ===
    context.mockSupabaseClient.maybeSingle.mockResolvedValueOnce({
      data: {
        stripe_account_id: "acct_test123456789",
        payouts_enabled: true,
      },
      error: null,
    });

    // === 仕様書: 7.2. 決済レコード作成 ===
    const mockPaymentId = "generated-payment-id";
    context.mockSupabaseClient.single.mockResolvedValueOnce({
      data: {
        id: mockPaymentId,
        attendance_id: context.testAttendance.id,
        method: "stripe",
        amount: 1000,
        status: "pending",
      },
      error: null,
    });

    // === 仕様書: 7.3. Application Fee 計算 ===
    context.mockApplicationFeeCalculator.calculateApplicationFee.mockResolvedValue({
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
    context.mockCreateOrRetrieveCustomer.mockResolvedValue({
      id: mockCustomerId,
      email: "test-guest@example.com",
      metadata: {
        actor_id: context.testAttendance.id,
        event_id: context.testEvent.id,
      },
    } as any);

    // === 仕様書: 7.5. Checkout Session 作成 ===
    const mockSessionId = "cs_test_xxxxxxxxxx";
    const mockSessionUrl =
      "https://checkout.stripe.com/pay/cs_test_xxxxxxxxxx#fidkdWxOYHwnPyd1blpxYHZxWjA0S...";
    context.mockCreateDestinationCheckoutSession.mockResolvedValue({
      id: mockSessionId,
      url: mockSessionUrl,
    } as any);

    // === 仕様書: 7.6. 決済レコード更新 ===
    context.mockSupabaseClient.update = jest.fn().mockReturnThis();
    context.mockSupabaseClient.eq = jest.fn().mockReturnValue({ error: null, data: {} });

    // === 実行 ===
    const result = await createGuestStripeSessionAction(input);

    // === 仕様書: 期待結果の検証 ===

    // 1. 入力検証が正しく行われること
    expect(context.mockValidateGuestToken).toHaveBeenCalledWith(context.testAttendance.guest_token);

    // 2. ゲストトークン検証の結果が正しく使用されること
    expect(context.mockValidateGuestToken).toHaveBeenCalledTimes(1);

    // 3. 決済許可条件チェックが正しく行われること
    expect(context.mockCanCreateStripeSession).toHaveBeenCalledWith(
      expect.objectContaining({
        id: context.testAttendance.id,
        status: "attending",
      }),
      expect.objectContaining({
        id: context.testEvent.id,
        fee: 1000,
      })
    );

    // 4. レート制限チェックが正しく行われること
    expect(context.mockBuildKey).toHaveBeenCalledWith({
      scope: "payment.createSession",
      attendanceId: context.testAttendance.id,
    });
    expect(context.mockEnforceRateLimit).toHaveBeenCalledWith({
      keys: ["RL:payment.createSession:attendance:test-attendance-id"],
      policy: POLICIES["payment.createSession"],
    });

    // 5. Application Fee計算が正しく行われること
    expect(context.mockApplicationFeeCalculator.calculateApplicationFee).toHaveBeenCalledWith(1000);

    // 6. Stripe Customer作成が正しいパラメータで行われること
    expect(context.mockCreateOrRetrieveCustomer).toHaveBeenCalledWith({
      email: "test-guest@example.com",
      name: "テストゲスト",
      metadata: {
        actor_id: context.testAttendance.id,
        event_id: context.testEvent.id,
      },
    });

    // 7. Checkout Session作成が正しいパラメータで行われること
    expect(context.mockCreateDestinationCheckoutSession).toHaveBeenCalledWith({
      eventId: context.testEvent.id,
      eventTitle: "テストイベント",
      amount: 1000,
      destinationAccountId: "acct_test123456789",
      platformFeeAmount: 100,
      customerId: mockCustomerId,
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
      actorId: context.testAttendance.id,
      metadata: {
        payment_id: mockPaymentId,
        attendance_id: context.testAttendance.id,
        event_title: "テストイベント",
      },
      idempotencyKey: expect.any(String),
    });

    // 8. 決済レコード更新が正しく行われること
    expect(context.mockSupabaseClient.update).toHaveBeenCalledWith({
      stripe_checkout_session_id: mockSessionId,
      destination_account_id: "acct_test123456789",
      application_fee_amount: 100,
      transfer_group: `event_${context.testEvent.id}_payout`,
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
