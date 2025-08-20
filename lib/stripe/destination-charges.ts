/**
 * Destination charges対応のStripe決済作成ヘルパー
 * 要件: transition-to-destination-charges
 */

import Stripe from 'stripe';
import { stripe, generateIdempotencyKey, createStripeRequestOptions } from './client';
import { retryWithIdempotency } from './idempotency-retry';
import { randomUUID } from 'crypto';

/**
 * Destination charges用のCheckout Session作成パラメータ
 */
export interface CreateDestinationCheckoutParams {
  eventId: string;
  eventTitle: string; // イベント名
  amount: number; // JPY, integer
  destinationAccountId: string; // acct_...
  platformFeeAmount: number; // 算出済み（円）
  customerId?: string; // プラットフォームのcustomer
  successUrl: string;
  cancelUrl: string;
  userId: string; // idempotency_key生成用
  metadata?: Record<string, string>; // 追加メタデータ
  setupFutureUsage?: 'off_session'; // オプション: カード保存フラグ
}

/**
 * Destination charges用のPaymentIntent作成パラメータ
 */
export interface CreateDestinationPaymentIntentParams {
  eventId: string;
  amount: number; // JPY, integer
  destinationAccountId: string; // acct_...
  platformFeeAmount: number; // 算出済み（円）
  customerId?: string; // プラットフォームのcustomer
  userId: string; // idempotency_key生成用
  confirmationMethod?: 'automatic' | 'manual';
  confirm?: boolean;
  metadata?: Record<string, string>; // 追加メタデータ
  setupFutureUsage?: 'off_session' | 'on_session'; // オプション: カード保存フラグ
}

/**
 * Destination charges対応のCheckout Session作成
 */
export async function createDestinationCheckoutSession(
  params: CreateDestinationCheckoutParams
): Promise<Stripe.Checkout.Session> {
  const {
    eventId,
    eventTitle,
    amount,
    destinationAccountId,
    platformFeeAmount,
    customerId,
    successUrl,
    cancelUrl,
    userId,
    metadata = {},
    setupFutureUsage,
  } = params;
  // --- Safety guard ------------------------------------------------------
  // application_fee_amount は決済金額を超えてはならない（Stripe API 制約）。
  if (platformFeeAmount >= amount) {
    throw new Error(
      `application_fee_amount (${platformFeeAmount}) must be less than amount (${amount}).`
    );
  }

  // Idempotency Key生成 (amount/currency を含めて重複防止)
  // userId と destinationAccountId の組み合わせで衝突を防止
  const idempotencyKey = generateIdempotencyKey('checkout', eventId, `${userId}:${destinationAccountId}`, {
    amount,
    currency: 'jpy',
  });

  // Transfer Group生成
  const transferGroup = `event_${eventId}_payout`;

  // メタデータ統合
  const sessionMetadata = {
    event_id: eventId,
    user_id: userId,
    ...metadata,
  };

  const createSession = (key: string) =>
    stripe.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'jpy',
              unit_amount: amount,
              product_data: {
                name: eventTitle,
                description: `EventPay - ${eventTitle}`,
              },
            },
            quantity: 1,
          },
        ],
        customer: customerId,
        success_url: successUrl,
        cancel_url: cancelUrl,
        // Destination charges設定
        payment_intent_data: {
          on_behalf_of: destinationAccountId,
          transfer_data: {
            destination: destinationAccountId,
          },
          application_fee_amount: platformFeeAmount,
          transfer_group: transferGroup,
          metadata: sessionMetadata,
          ...(setupFutureUsage ? { setup_future_usage: setupFutureUsage } : {}),
        },
        metadata: sessionMetadata,
      },
      createStripeRequestOptions(key)
    );

  // 同一キーで 409 をハンドリング
  const session = await retryWithIdempotency(() => createSession(idempotencyKey));

  return session;
}

/**
 * Destination charges対応のPaymentIntent作成
 */
export async function createDestinationPaymentIntent(
  params: CreateDestinationPaymentIntentParams
): Promise<Stripe.PaymentIntent> {
  const {
    eventId,
    amount,
    destinationAccountId,
    platformFeeAmount,
    customerId,
    userId,
    confirmationMethod = 'automatic',
    confirm = false,
    metadata = {},
    setupFutureUsage,
  } = params;
  // --- Safety guard ------------------------------------------------------
  if (platformFeeAmount >= amount) {
    throw new Error(
      `application_fee_amount (${platformFeeAmount}) must be less than amount (${amount}).`
    );
  }

  // Idempotency Key生成 (amount/currency を含めて重複防止)
  // userId と destinationAccountId の組み合わせで衝突を防止
  const idempotencyKey = generateIdempotencyKey('payment_intent', eventId, `${userId}:${destinationAccountId}`, {
    amount,
    currency: 'jpy',
  });

  // Transfer Group生成
  const transferGroup = `event_${eventId}_payout`;

  // メタデータ統合
  const intentMetadata = {
    event_id: eventId,
    user_id: userId,
    ...metadata,
  };

  const createIntent = (key: string) =>
    stripe.paymentIntents.create(
      {
        amount,
        currency: 'jpy',
        customer: customerId,
        confirmation_method: confirmationMethod,
        confirm,
        // Destination charges設定
        on_behalf_of: destinationAccountId,
        transfer_data: {
          destination: destinationAccountId,
        },
        application_fee_amount: platformFeeAmount,
        transfer_group: transferGroup,
        metadata: intentMetadata,
        ...(setupFutureUsage ? { setup_future_usage: setupFutureUsage } : {}),
      },
      createStripeRequestOptions(key)
    );

  const paymentIntent = await retryWithIdempotency(() => createIntent(idempotencyKey));

  return paymentIntent;
}

/**
 * Destination charges対応の返金処理
 * デフォルトで reverse_transfer=true, refund_application_fee=true を適用
 */
export interface CreateDestinationRefundParams {
  paymentIntentId: string;
  amount?: number; // 部分返金時のみ指定
  reason?: Stripe.RefundCreateParams.Reason;
  reverseTransfer?: boolean; // デフォルト: true
  refundApplicationFee?: boolean; // デフォルト: true
  refundId?: string;
  metadata?: Record<string, string>;
}

export async function createDestinationRefund(
  params: CreateDestinationRefundParams
): Promise<Stripe.Refund> {
  const {
    paymentIntentId,
    amount,
    reason,
    reverseTransfer = true,
    refundApplicationFee = true,
    refundId: providedRefundId,
    metadata = {},
  } = params;

  const refundParams: Stripe.RefundCreateParams = {
    payment_intent: paymentIntentId,
    reverse_transfer: reverseTransfer,
    refund_application_fee: refundApplicationFee,
    metadata,
  };

  // 部分返金の場合のみ金額を指定
  if (amount !== undefined) {
    refundParams.amount = amount;
  }

  if (reason) {
    refundParams.reason = reason;
  }

  // Refund ID生成（優先順位: providedRefundId > metadata.refund_id > 新しいUUID）
  // 再試行時の安全性を確保するため、常に同じrefundIdに対して同じidempotency keyを生成
  const refundId: string =
    providedRefundId ||
    (metadata?.refund_id as string | undefined) ||
    randomUUID();

  // metadata に refund_id を必ず含める
  refundParams.metadata = {
    ...metadata,
    refund_id: refundId,
  };

  const idempotencyKey = generateIdempotencyKey('refund', paymentIntentId, refundId);

  const createRefund = () =>
    stripe.refunds.create(refundParams, createStripeRequestOptions(idempotencyKey));

  return await retryWithIdempotency(createRefund);
}

// Charge ID を直接指定して返金するユーティリティ
export interface CreateDestinationRefundByChargeParams {
  chargeId: string;
  amount?: number; // 部分返金時のみ指定
  reason?: Stripe.RefundCreateParams.Reason;
  reverseTransfer?: boolean; // デフォルト: true
  refundApplicationFee?: boolean; // デフォルト: true
  refundId?: string; // 再試行時の安全性を確保するため、呼び出し元から指定可能
  metadata?: Record<string, string>;
}

export async function createDestinationRefundByCharge(
  params: CreateDestinationRefundByChargeParams
): Promise<Stripe.Refund> {
  const {
    chargeId,
    amount,
    reason,
    reverseTransfer = true,
    refundApplicationFee = true,
    refundId: providedRefundId,
    metadata = {},
  } = params;

  const refundParams: Stripe.RefundCreateParams = {
    charge: chargeId,
    reverse_transfer: reverseTransfer,
    refund_application_fee: refundApplicationFee,
    metadata,
  };

  if (amount !== undefined) {
    refundParams.amount = amount;
  }
  if (reason) {
    refundParams.reason = reason;
  }

  // Refund ID生成（優先順位: providedRefundId > metadata.refund_id > 新しいUUID）
  // 再試行時の安全性を確保するため、常に同じrefundIdに対して同じidempotency keyを生成
  const refundId: string =
    providedRefundId ||
    (metadata?.refund_id as string | undefined) ||
    randomUUID();

  // metadata に refund_id を必ず含める
  refundParams.metadata = {
    ...metadata,
    refund_id: refundId,
  };

  const idempotencyKey = generateIdempotencyKey('refund', chargeId, refundId);

  const createRefund = () =>
    stripe.refunds.create(refundParams, createStripeRequestOptions(idempotencyKey));

  return await retryWithIdempotency(createRefund);
}

/**
 * PaymentIntent.latest_charge を取得して返金するユーティリティ
 * - latest_charge が取得できない/文字列のみの場合は従来の payment_intent 返金にフォールバック
 */
export async function createDestinationRefundLatestCharge(
  params: CreateDestinationRefundParams
): Promise<Stripe.Refund> {
  const {
    paymentIntentId,
    amount,
    reason,
    reverseTransfer = true,
    refundApplicationFee = true,
    metadata = {},
  } = params;

  // PaymentIntent から latest_charge を取得
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ['latest_charge'],
  });

  const latestCharge = paymentIntent.latest_charge as unknown as Stripe.Charge | string | null;

  if (latestCharge && typeof latestCharge !== 'string') {
    // latest_charge オブジェクトが取得できた場合は Charge 返金を実行
    return await createDestinationRefundByCharge({
      chargeId: latestCharge.id,
      amount,
      reason,
      reverseTransfer,
      refundApplicationFee,
      refundId: params.refundId,
      metadata,
    });
  }

  // フォールバック: 従来の PaymentIntent 返金
  return await createDestinationRefund(params);
}

/**
 * Customer作成・取得ヘルパー
 * 既存検索→無ければ作成→payments.stripe_customer_id保存の流れをサポート
 */
export interface CreateOrRetrieveCustomerParams {
  email?: string;
  name?: string;
  metadata?: Record<string, string>;
}

export async function createOrRetrieveCustomer(
  params: CreateOrRetrieveCustomerParams
): Promise<Stripe.Customer> {
  const { email, name, metadata = {} } = params;

  // メールアドレスが指定されている場合、既存顧客を検索
  if (email) {
    const existingCustomers = await stripe.customers.list({
      email,
      limit: 1,
    });

    if (existingCustomers.data.length > 0) {
      return existingCustomers.data[0];
    }
  }

  // 新規顧客作成
  return await stripe.customers.create({
    email,
    name,
    metadata,
  });
}

/**
 * Transfer Group関連のユーティリティ
 */
export const transferGroupUtils = {
  /**
   * イベント用のTransfer Group生成
   */
  generateEventTransferGroup: (eventId: string): string => {
    return `event_${eventId}_payout`;
  },

  /**
   * Transfer GroupからイベントIDを抽出
   */
  extractEventIdFromTransferGroup: (transferGroup: string): string | null => {
    const match = transferGroup.match(/^event_(.+)_payout$/);
    return match ? match[1] : null;
  },
};
