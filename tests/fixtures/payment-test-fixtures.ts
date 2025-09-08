/**
 * 決済テスト用フィクスチャ
 *
 * 再利用可能なテストデータとモックレスポンス
 */

import {
  mockCheckoutSession,
  mockPaymentIntent,
  mockConnectAccount,
  createMockWebhookEvent,
} from "../setup/stripe-mock";

/**
 * テスト用のイベントデータフィクスチャ
 */
export const eventFixtures = {
  paidEvent: {
    id: "evt_test_paid_event",
    title: "有料テストイベント",
    fee: 1500,
    capacity: 50,
    payment_methods: ["stripe"] as const,
    date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 明日
  },

  freeEvent: {
    id: "evt_test_free_event",
    title: "無料テストイベント",
    fee: 0,
    capacity: null,
    payment_methods: [] as const,
    date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 明日
  },

  fullCapacityEvent: {
    id: "evt_test_full_event",
    title: "満員テストイベント",
    fee: 1000,
    capacity: 1, // 定員1名（満員テスト用）
    payment_methods: ["stripe"] as const,
    date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 明日
  },
};

/**
 * テスト用のユーザーデータフィクスチャ
 */
export const userFixtures = {
  withConnect: {
    id: "user_test_with_connect",
    email: "test-with-connect@example.com",
    hasStripeConnect: true,
    stripeConnectAccountId: "acct_1RwIFbCZwTLGDVBd",
    payoutsEnabled: true,
    chargesEnabled: true,
  },

  withoutConnect: {
    id: "user_test_without_connect",
    email: "test-without-connect@example.com",
    hasStripeConnect: false,
    payoutsEnabled: false,
    chargesEnabled: false,
  },

  payoutsDisabled: {
    id: "user_test_payouts_disabled",
    email: "test-payouts-disabled@example.com",
    hasStripeConnect: true,
    stripeConnectAccountId: "acct_1RwIFbCZwTLGDVBd",
    payoutsEnabled: false,
    chargesEnabled: true,
  },
};

/**
 * テスト用の参加者データフィクスチャ
 */
export const attendanceFixtures = {
  attending: {
    id: "att_test_attending",
    email: "participant@example.com",
    nickname: "テスト参加者",
    status: "attending" as const,
    guest_token: "guest_token_attending",
  },

  waitlisted: {
    id: "att_test_waitlisted",
    email: "waitlisted@example.com",
    nickname: "待機リスト参加者",
    status: "waitlisted" as const,
    guest_token: "guest_token_waitlisted",
  },

  declined: {
    id: "att_test_declined",
    email: "declined@example.com",
    nickname: "不参加者",
    status: "declined" as const,
    guest_token: "guest_token_declined",
  },
};

/**
 * テスト用の決済データフィクスチャ
 */
export const paymentFixtures = {
  pending: {
    id: "pay_test_pending",
    amount: 1500,
    status: "pending" as const,
    method: "stripe" as const,
    application_fee_amount: 150,
    stripe_account_id: "acct_1RwIFbCZwTLGDVBd",
  },

  completed: {
    id: "pay_test_completed",
    amount: 1500,
    status: "completed" as const,
    method: "stripe" as const,
    application_fee_amount: 150,
    stripe_account_id: "acct_1RwIFbCZwTLGDVBd",
    paid_at: new Date().toISOString(),
    stripe_payment_intent_id: "pi_test_completed",
  },

  failed: {
    id: "pay_test_failed",
    amount: 1500,
    status: "failed" as const,
    method: "stripe" as const,
    application_fee_amount: 150,
    stripe_account_id: "acct_1RwIFbCZwTLGDVBd",
  },

  withExistingAmount: {
    id: "pay_test_existing_amount",
    amount: 2000, // 既存の金額（イベント料金と異なる）
    status: "pending" as const,
    method: "stripe" as const,
    application_fee_amount: 200,
    stripe_account_id: "acct_1RwIFbCZwTLGDVBd",
  },
};

/**
 * Stripe Checkout作成パラメータのフィクスチャ
 */
export const checkoutParamsFixtures = {
  basic: {
    mode: "payment" as const,
    currency: "jpy",
    on_behalf_of: "acct_1RwIFbCZwTLGDVBd",
    transfer_data: {
      destination: "acct_1RwIFbCZwTLGDVBd",
    },
    application_fee_amount: 150,
    metadata: {
      payment_id: "pay_test_pending",
      attendance_id: "att_test_attending",
      event_title: "有料テストイベント",
    },
    success_url: "http://localhost:3000/payments/success?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: "http://localhost:3000/payments/cancel",
  },

  withExistingAmount: {
    mode: "payment" as const,
    currency: "jpy",
    on_behalf_of: "acct_1RwIFbCZwTLGDVBd",
    transfer_data: {
      destination: "acct_1RwIFbCZwTLGDVBd",
    },
    application_fee_amount: 200, // 既存金額ベース
    metadata: {
      payment_id: "pay_test_existing_amount",
      attendance_id: "att_test_attending",
      event_title: "有料テストイベント",
    },
    success_url: "http://localhost:3000/payments/success?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: "http://localhost:3000/payments/cancel",
  },
};

/**
 * Webhook イベントのフィクスチャ
 */
export const webhookEventFixtures = {
  checkoutCompleted: () =>
    createMockWebhookEvent("checkout.session.completed", {
      ...mockCheckoutSession,
      status: "complete",
      payment_status: "paid",
      payment_intent: "pi_test_completed",
      metadata: {
        payment_id: "pay_test_pending",
        attendance_id: "att_test_attending",
        event_title: "有料テストイベント",
      },
    }),

  paymentIntentSucceeded: () =>
    createMockWebhookEvent("payment_intent.succeeded", {
      ...mockPaymentIntent,
      id: "pi_test_completed",
      status: "succeeded",
      amount_received: 1500,
      application_fee_amount: 150,
      on_behalf_of: "acct_1RwIFbCZwTLGDVBd",
      transfer_data: {
        destination: "acct_1RwIFbCZwTLGDVBd",
      },
      metadata: {
        payment_id: "pay_test_pending",
        attendance_id: "att_test_attending",
        event_title: "有料テストイベント",
      },
    }),

  paymentIntentFailed: () =>
    createMockWebhookEvent("payment_intent.payment_failed", {
      ...mockPaymentIntent,
      id: "pi_test_failed",
      status: "requires_payment_method",
      last_payment_error: {
        type: "card_error",
        code: "card_declined",
        message: "Your card was declined.",
      },
      metadata: {
        payment_id: "pay_test_pending",
        attendance_id: "att_test_attending",
        event_title: "有料テストイベント",
      },
    }),
};

/**
 * Connect アカウントのフィクスチャ
 */
export const connectAccountFixtures = {
  active: {
    ...mockConnectAccount,
    id: "acct_1RwIFbCZwTLGDVBd",
    payouts_enabled: true,
    charges_enabled: true,
    details_submitted: true,
  },

  payoutsDisabled: {
    ...mockConnectAccount,
    id: "acct_test_payouts_disabled",
    payouts_enabled: false,
    charges_enabled: true,
    details_submitted: true,
  },

  notSetup: {
    ...mockConnectAccount,
    id: "acct_test_not_setup",
    payouts_enabled: false,
    charges_enabled: false,
    details_submitted: false,
  },
};

/**
 * エラーレスポンスのフィクスチャ
 */
export const errorFixtures = {
  connectNotSetup: {
    type: "invalid_request_error" as const,
    code: "account_invalid",
    message: "The provided account is not set up for payments or payouts are not enabled",
    statusCode: 400,
  },

  payoutsDisabled: {
    type: "invalid_request_error" as const,
    code: "account_invalid",
    message: "Payouts are not enabled for this account",
    statusCode: 400,
  },

  cardDeclined: {
    type: "card_error" as const,
    code: "card_declined",
    message: "Your card was declined.",
    statusCode: 402,
  },

  insufficientFunds: {
    type: "card_error" as const,
    code: "insufficient_funds",
    message: "Your card has insufficient funds.",
    statusCode: 402,
  },
};

/**
 * APIレスポンスのフィクスチャ
 */
export const apiResponseFixtures = {
  createCheckoutSession: {
    success: {
      sessionUrl: `https://checkout.stripe.com/c/pay/${mockCheckoutSession.id}#fidkdWxOYHwnPyd1blpxYHZxWjA0VDM0NWdLUGRLYGRfUWNHZklcVlxhSEZyMFRdUmJXc3VdRmJfU1NqVmFOaGFLNzc3VjEwYkx0XEBmbWZPRWZGZzJTSXNLVzJxZTJHYjNxTGhWZDZfVTJLNDNfcnJJSycpJ2N3amhWYHdzYHcnP3F3cGApJ2lkfGpwcVF8dWAnPyd2bGtiaWBabHFgaCcpJ2BrZGdpYFVpZGZgbWppYWB3dic%2FcXdwYCkndnF3YHVCJykpZHdxdHVpZmRpYWNmanFxYWBqZGZqY2Rqd2FqZGRrJ3gl`,
      sessionId: mockCheckoutSession.id,
    },
    connectError: {
      error: "Connect account not configured or payouts not enabled",
      code: "CONNECT_NOT_CONFIGURED",
    },
  },
};

/**
 * テストシナリオ用の組み合わせフィクスチャ
 */
export const scenarioFixtures = {
  // 正常な決済開始シナリオ
  normalPaymentFlow: {
    user: userFixtures.withConnect,
    event: eventFixtures.paidEvent,
    attendance: attendanceFixtures.attending,
    payment: paymentFixtures.pending,
    checkoutParams: checkoutParamsFixtures.basic,
    expectedResponse: apiResponseFixtures.createCheckoutSession.success,
  },

  // Connect未設定エラーシナリオ
  connectNotSetupError: {
    user: userFixtures.withoutConnect,
    event: eventFixtures.paidEvent,
    attendance: attendanceFixtures.attending,
    payment: paymentFixtures.pending,
    expectedError: errorFixtures.connectNotSetup,
  },

  // payouts無効エラーシナリオ
  payoutsDisabledError: {
    user: userFixtures.payoutsDisabled,
    event: eventFixtures.paidEvent,
    attendance: attendanceFixtures.attending,
    payment: paymentFixtures.pending,
    expectedError: errorFixtures.payoutsDisabled,
  },

  // 既存金額優先シナリオ
  existingAmountPriority: {
    user: userFixtures.withConnect,
    event: eventFixtures.paidEvent,
    attendance: attendanceFixtures.attending,
    payment: paymentFixtures.withExistingAmount,
    checkoutParams: checkoutParamsFixtures.withExistingAmount,
    expectedResponse: apiResponseFixtures.createCheckoutSession.success,
  },
};
