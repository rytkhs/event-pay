/**
 * Stripe モックセットアップ
 *
 * 決済テスト用のStripe APIモック設定
 * ベストプラクティス：
 * - テストモードのAPI呼び出しを模倣
 * - Destination charges パラメータの検証
 * - Webhook署名の検証をバイパス
 */

import type Stripe from "stripe";

// Stripe Checkout Session のモックデータ
export const mockCheckoutSession: Stripe.Checkout.Session = {
  id: "cs_test_1234567890abcdefghijklmnopqrstuvwxyz",
  object: "checkout.session",
  after_expiration: null,
  allow_promotion_codes: null,
  amount_subtotal: 1000,
  amount_total: 1000,
  automatic_tax: { enabled: false, liability: null, status: null },
  billing_address_collection: null,
  cancel_url: "http://localhost:3000/cancel",
  client_reference_id: null,
  client_secret: null,
  consent: null,
  consent_collection: null,
  created: Math.floor(Date.now() / 1000),
  currency: "jpy",
  currency_conversion: null,
  custom_fields: [],
  custom_text: {
    after_submit: null,
    shipping_address: null,
    submit: null,
    terms_of_service_acceptance: null,
  },
  customer: null,
  customer_creation: "if_required",
  customer_details: null,
  customer_email: null,
  expires_at: Math.floor(Date.now() / 1000) + 86400, // 24時間後
  invoice: null,
  invoice_creation: null,
  livemode: false,
  locale: null,
  metadata: {},
  mode: "payment",
  payment_intent: "pi_test_1234567890abcdefghijklmnopqrstuvwxyz",
  payment_link: null,
  payment_method_collection: "if_required",
  payment_method_configuration_details: null,
  payment_method_options: {},
  payment_method_types: ["card"],
  payment_status: "unpaid",
  phone_number_collection: { enabled: false },
  recovered_from: null,
  saved_payment_method_options: null,
  setup_intent: null,
  shipping_address_collection: null,
  shipping_cost: null,
  shipping_details: null,
  shipping_options: [],
  status: "open",
  submit_type: null,
  subscription: null,
  success_url: "http://localhost:3000/success",
  total_details: {
    amount_discount: 0,
    amount_shipping: 0,
    amount_tax: 0,
  },
  ui_mode: "hosted",
  url: "https://checkout.stripe.com/c/pay/cs_test_1234567890abcdefghijklmnopqrstuvwxyz#fidkdWxOYHwnPyd1blpxYHZxWjA0VDM0NWdLUGRLYGRfUWNHZklcVlxhSEZyMFRdUmJXc3VdRmJfU1NqVmFOaGFLNzc3VjEwYkx0XEBmbWZPRWZGZzJTSXNLVzJxZTJHYjNxTGhWZDZfVTJLNDNfcnJJSycpJ2N3amhWYHdzYHcnP3F3cGApJ2lkfGpwcVF8dWAnPyd2bGtiaWBabHFgaCcpJ2BrZGdpYFVpZGZgbWppYWB3dic%2FcXdwYCkndnF3YHVCJykpZHdxdHVpZmRpYWNmanFxYWBqZGZqY2Rqd2FqZGRrJ3gl",
};

// PaymentIntent のモックデータ
export const mockPaymentIntent: Stripe.PaymentIntent = {
  id: "pi_test_1234567890abcdefghijklmnopqrstuvwxyz",
  object: "payment_intent",
  amount: 1000,
  amount_capturable: 0,
  amount_details: {
    tip: {},
  },
  amount_received: 0,
  application: null,
  application_fee_amount: 100, // 10%の手数料
  automatic_payment_methods: null,
  canceled_at: null,
  cancellation_reason: null,
  capture_method: "automatic",
  client_secret: "pi_test_1234567890abcdefghijklmnopqrstuvwxyz_secret_test",
  confirmation_method: "automatic",
  created: Math.floor(Date.now() / 1000),
  currency: "jpy",
  customer: null,
  description: null,
  invoice: null,
  last_payment_error: null,
  latest_charge: null,
  livemode: false,
  metadata: {},
  next_action: null,
  on_behalf_of: "acct_test_connect_account",
  payment_method: null,
  payment_method_configuration_details: null,
  payment_method_options: {},
  payment_method_types: ["card"],
  processing: null,
  receipt_email: null,
  review: null,
  setup_future_usage: null,
  shipping: null,
  statement_descriptor: null,
  statement_descriptor_suffix: null,
  status: "requires_payment_method",
  transfer_data: {
    destination: "acct_test_connect_account",
  },
  transfer_group: null,
  source: null,
};

// Connect Account のモックデータ
export const mockConnectAccount: Stripe.Account = {
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
};

// Webhook Event のモックデータ生成関数
export const createMockWebhookEvent = (type: string, data: Record<string, unknown>): Stripe.Event =>
  ({
    id: `evt_test_${Math.random().toString(36).substring(2, 15)}`,
    object: "event",
    account: "acct_test_connect_account",
    api_version: "2024-04-10",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: data,
    } as Stripe.Event.Data,
    livemode: false,
    pending_webhooks: 1,
    request: {
      id: `req_test_${Math.random().toString(36).substring(2, 15)}`,
      idempotency_key: null,
    },
    type: type as Stripe.Event.Type,
  }) as Stripe.Event;

// Stripe APIクライアントのモック関数
export const createMockStripeClient = () => {
  const mockClient = {
    checkout: {
      sessions: {
        create: jest.fn(),
        retrieve: jest.fn(),
      },
    },
    paymentIntents: {
      retrieve: jest.fn(),
      confirm: jest.fn(),
    },
    accounts: {
      retrieve: jest.fn(),
    },
    webhooks: {
      constructEvent: jest.fn(),
    },
  };

  // デフォルトの戻り値を設定
  mockClient.checkout.sessions.create.mockResolvedValue(mockCheckoutSession);
  mockClient.checkout.sessions.retrieve.mockResolvedValue(mockCheckoutSession);
  mockClient.paymentIntents.retrieve.mockResolvedValue(mockPaymentIntent);
  mockClient.accounts.retrieve.mockResolvedValue(mockConnectAccount);

  return mockClient;
};

// Webhook署名検証のモック
export const mockWebhookSignatureVerification = (isValid: boolean = true): jest.Mock => {
  const mockConstructEvent = jest.fn();

  if (isValid) {
    mockConstructEvent.mockImplementation((payload: string, signature: string, secret: string) => {
      // 実際のStripe署名検証ロジックを簡易模倣
      try {
        const eventData = JSON.parse(payload);

        // 署名形式の基本チェック（t=timestamp,v1=signature）
        if (!signature.includes("t=") || !signature.includes("v1=")) {
          throw new Error("Invalid signature format");
        }

        // Webhook secretの形式チェック
        if (!secret.startsWith("whsec_test_")) {
          throw new Error("Invalid webhook secret format");
        }

        return eventData;
      } catch (error) {
        if (error instanceof SyntaxError) {
          throw new Error("Invalid JSON payload");
        }
        throw error;
      }
    });
  } else {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("Invalid signature");
    });
  }

  return mockConstructEvent;
};

// テスト用Stripeアカウント設定
export const testStripeAccounts = {
  // Connect未設定のアカウント
  noConnect: {
    id: "acct_test_no_connect",
    payouts_enabled: false,
    charges_enabled: false,
  },
  // Connect設定済みのアカウント
  withConnect: {
    id: "acct_test_with_connect",
    payouts_enabled: true,
    charges_enabled: true,
  },
  // payouts_enabled=falseのアカウント
  payoutsDisabled: {
    id: "acct_test_payouts_disabled",
    payouts_enabled: false,
    charges_enabled: true,
  },
};

// テスト用の決済データ
export const testPaymentData = {
  // 基本的な決済データ
  basic: {
    amount: 1000,
    currency: "jpy",
    application_fee_amount: 100,
  },
  // 既存のpayments.amountがある場合
  withExistingAmount: {
    amount: 1500, // 既存の金額
    currency: "jpy",
    application_fee_amount: 150,
  },
};
