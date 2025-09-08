/**
 * Stripe テストヘルパー関数
 *
 * 決済テストで使用する共通のヘルパー関数とユーティリティ
 */

import crypto from "crypto";

import type Stripe from "stripe";

import { createMockWebhookEvent, mockCheckoutSession, mockPaymentIntent } from "./stripe-mock";

// テスト用のStripe Checkout作成パラメータを検証する関数
export const assertCheckoutSessionParams = (
  mockCreate: jest.Mock,
  expectedParams: {
    on_behalf_of?: string;
    transfer_data?: { destination: string };
    application_fee_amount?: number;
    metadata?: Record<string, string>;
    success_url?: string;
    cancel_url?: string;
    line_items?: Array<{
      price_data: {
        currency: string;
        product_data: { name: string };
        unit_amount: number;
      };
      quantity: number;
    }>;
  }
) => {
  expect(mockCreate).toHaveBeenCalledWith(
    expect.objectContaining(expectedParams),
    expect.any(Object) // Stripe.RequestOptions
  );
};

// テスト用のWebhookイベントを作成する関数
export const createTestWebhookEvent = (
  type: "checkout.session.completed" | "payment_intent.succeeded" | "payment_intent.payment_failed",
  overrides: Record<string, unknown> = {}
): Stripe.Event => {
  let baseData: Record<string, unknown>;

  switch (type) {
    case "checkout.session.completed":
      baseData = {
        ...mockCheckoutSession,
        status: "complete",
        payment_status: "paid",
        ...overrides,
      };
      break;
    case "payment_intent.succeeded":
      baseData = {
        ...mockPaymentIntent,
        status: "succeeded",
        amount_received: mockPaymentIntent.amount,
        ...overrides,
      };
      break;
    case "payment_intent.payment_failed":
      baseData = {
        ...mockPaymentIntent,
        status: "requires_payment_method",
        last_payment_error: {
          type: "card_error",
          code: "card_declined",
          message: "Your card was declined.",
        },
        ...overrides,
      };
      break;
    default:
      throw new Error(`Unsupported webhook event type: ${type}`);
  }

  return createMockWebhookEvent(type, baseData);
};

// Webhook署名を生成する関数（テスト用）
export const generateTestWebhookSignature = (
  payload: string,
  secret: string = "STRIPE_WEBHOOK_SECRET_REDACTED"
): string => {
  // 実際のStripe署名形式を模倣
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${payload}`;

  // 実際のStripe署名アルゴリズム（HMAC-SHA256）を使用
  // Webhook secretから'whsec_test_'プレフィックスを除去
  const signingSecret = secret.replace("whsec_test_", "");
  const signature = crypto
    .createHmac("sha256", signingSecret)
    .update(signedPayload, "utf8")
    .digest("hex");

  return `t=${timestamp},v1=${signature}`;
};

// Stripe APIエラーを模倣する関数
export const createStripeError = (
  type: "card_error" | "invalid_request_error" | "api_error",
  code: string,
  message: string,
  statusCode: number = 400
) => {
  const error = new Error(message) as any;
  error.type = type;
  error.code = code;
  error.statusCode = statusCode;
  error.requestId = `req_test_${Math.random().toString(36).substring(2, 15)}`;

  return error;
};

// Connect未設定エラーを作成する関数
export const createConnectNotSetupError = () => {
  return createStripeError(
    "invalid_request_error",
    "account_invalid",
    "The provided account is not set up for payments or payouts are not enabled",
    400
  );
};

// テスト用のConnect設定済みアカウント情報
export const createMockConnectAccount = (
  overrides: Partial<Stripe.Account> = {}
): Stripe.Account => {
  return {
    id: "acct_test_connect_account",
    object: "account",
    business_profile: null,
    business_type: null,
    capabilities: {
      card_payments: "active",
      transfers: "active",
    },
    charges_enabled: true,
    company: undefined,
    controller: {
      type: "account",
    },
    country: "JP",
    created: Math.floor(Date.now() / 1000),
    default_currency: "jpy",
    details_submitted: true,
    email: "connect-test@example.com",
    external_accounts: {
      object: "list",
      data: [],
      has_more: false,
      url: "/v1/accounts/acct_test_connect_account/external_accounts",
    },
    future_requirements: {
      alternatives: [],
      current_deadline: null,
      currently_due: [],
      disabled_reason: null,
      errors: [],
      eventually_due: [],
      past_due: [],
      pending_verification: [],
    },
    individual: undefined,
    metadata: {},
    payouts_enabled: true,
    requirements: {
      alternatives: [],
      current_deadline: null,
      currently_due: [],
      disabled_reason: null,
      errors: [],
      eventually_due: [],
      past_due: [],
      pending_verification: [],
    },
    settings: {
      bacs_debit_payments: {
        display_name: null,
        service_user_number: null,
      },
      branding: {
        icon: null,
        logo: null,
        primary_color: null,
        secondary_color: null,
      },
      card_issuing: {
        tos_acceptance: {
          date: null,
          ip: null,
        },
      },
      card_payments: {
        decline_on: {
          avs_failure: false,
          cvc_failure: false,
        },
        statement_descriptor_prefix: null,
        statement_descriptor_prefix_kana: null,
        statement_descriptor_prefix_kanji: null,
      },
      dashboard: {
        display_name: "Test Connect Account",
        timezone: "Asia/Tokyo",
      },
      invoices: {
        default_account_tax_ids: null,
      },
      payments: {
        statement_descriptor: "EVENTPAY",
        statement_descriptor_kana: null,
        statement_descriptor_kanji: null,
        statement_descriptor_prefix_kana: null,
        statement_descriptor_prefix_kanji: null,
      },
      payouts: {
        debit_negative_balances: false,
        schedule: {
          delay_days: 7,
          interval: "weekly",
          weekly_anchor: "friday",
        },
        statement_descriptor: null,
      },
      sepa_debit_payments: {},
      treasury: {
        tos_acceptance: {
          date: null,
          ip: null,
        },
      },
    },
    tos_acceptance: {
      date: Math.floor(Date.now() / 1000),
      ip: "127.0.0.1",
      user_agent: "test-user-agent",
    },
    type: "express",
    ...overrides,
  };
};

// テスト用のidempotency keyを生成する関数
export const generateTestIdempotencyKey = (prefix?: string): string => {
  // テスト環境では固定のUUIDを使用してテストの再現性を保つ
  const testUuid = "550e8400-e29b-41d4-a716-446655440000";
  return prefix ? `${prefix}_${testUuid}` : testUuid;
};

// APIテスト用の共通アサーション
export const assertStripeRequestOptions = (
  mockFunction: jest.Mock,
  expectedIdempotencyKey?: string
) => {
  const calls = mockFunction.mock.calls;
  expect(calls.length).toBeGreaterThan(0);

  const lastCall = calls[calls.length - 1];
  const requestOptions = lastCall[lastCall.length - 1]; // 最後の引数がRequestOptions

  if (expectedIdempotencyKey) {
    expect(requestOptions).toHaveProperty("idempotencyKey", expectedIdempotencyKey);
  }
};

// テスト用のメタデータを生成する関数
export const createTestMetadata = (
  paymentId: string,
  attendanceId: string,
  eventTitle: string
): Record<string, string> => {
  return {
    payment_id: paymentId,
    attendance_id: attendanceId,
    event_title: eventTitle,
    test_mode: "true",
  };
};
