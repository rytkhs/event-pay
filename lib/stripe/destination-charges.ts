import Stripe from 'stripe';
import { stripe, generateIdempotencyKey, createStripeRequestOptions } from './client';
import { getTransferGroupForEvent } from '@/lib/utils/stripe';
import { retryWithIdempotency } from './idempotency-retry';
import { randomUUID } from 'crypto';

// Destination charges用のCheckout Session作成パラメータ
export interface CreateDestinationCheckoutParams {
  eventId: string;
  eventTitle: string;
  amount: number; // JPY, integer
  destinationAccountId: string; // acct_...
  platformFeeAmount: number; // 円
  customerId?: string; // プラットフォームのcustomer
  successUrl: string;
  cancelUrl: string;
  actorId: string; // idempotency_key生成用（認証ユーザー=users.id / ゲスト=attendances.id）
  metadata?: Record<string, string>;
  setupFutureUsage?: 'off_session';
}

// Destination charges用のPaymentIntent作成パラメータ
export interface CreateDestinationPaymentIntentParams {
  eventId: string;
  amount: number; // JPY, integer
  destinationAccountId: string; // acct_...
  platformFeeAmount: number; // 円
  customerId?: string; // プラットフォームのcustomer
  actorId: string; // idempotency_key生成用
  confirmationMethod?: 'automatic' | 'manual';
  confirm?: boolean;
  metadata?: Record<string, string>;
  setupFutureUsage?: 'off_session' | 'on_session';
}

// Destination charges対応のCheckout Session作成
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
    actorId,
    metadata = {},
    setupFutureUsage,
  } = params;

  if (platformFeeAmount > amount) {
    throw new Error(
      `application_fee_amount (${platformFeeAmount}) must be less than amount (${amount}).`
    );
  }

  const idempotencyKey = generateIdempotencyKey('checkout', eventId, `${actorId}:${destinationAccountId}`, {
    amount,
    currency: 'jpy',
  });

  const transferGroup = getTransferGroupForEvent(eventId);

  const sessionMetadata = {
    event_id: eventId,
    actor_id: actorId,
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
        client_reference_id: metadata?.payment_id ?? undefined,
        success_url: (() => {
          const u = new URL(successUrl);
          u.searchParams.set('session_id', '{CHECKOUT_SESSION_ID}');
          return u.toString();
        })(),
        cancel_url: (() => {
          const u = new URL(cancelUrl);
          u.searchParams.set('session_id', '{CHECKOUT_SESSION_ID}');
          return u.toString();
        })(),
        payment_intent_data: {
          on_behalf_of: destinationAccountId,
          transfer_data: { destination: destinationAccountId },
          application_fee_amount: platformFeeAmount,
          transfer_group: transferGroup,
          metadata: sessionMetadata,
          ...(setupFutureUsage ? { setup_future_usage: setupFutureUsage } : {}),
        },
        metadata: sessionMetadata,
      },
      createStripeRequestOptions(key)
    );

  return await retryWithIdempotency(() => createSession(idempotencyKey));
}

// Destination charges対応のPaymentIntent作成
export async function createDestinationPaymentIntent(
  params: CreateDestinationPaymentIntentParams
): Promise<Stripe.PaymentIntent> {
  const {
    eventId,
    amount,
    destinationAccountId,
    platformFeeAmount,
    customerId,
    actorId,
    confirmationMethod = 'automatic',
    confirm = false,
    metadata = {},
    setupFutureUsage,
  } = params;

  if (platformFeeAmount > amount) {
    throw new Error(
      `application_fee_amount (${platformFeeAmount}) must be less than amount (${amount}).`
    );
  }

  const idempotencyKey = generateIdempotencyKey('payment_intent', eventId, `${actorId}:${destinationAccountId}`, {
    amount,
    currency: 'jpy',
  });

  const transferGroup = getTransferGroupForEvent(eventId);

  const intentMetadata = {
    event_id: eventId,
    actor_id: actorId,
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
        on_behalf_of: destinationAccountId,
        transfer_data: { destination: destinationAccountId },
        application_fee_amount: platformFeeAmount,
        transfer_group: transferGroup,
        metadata: intentMetadata,
        ...(setupFutureUsage ? { setup_future_usage: setupFutureUsage } : {}),
      },
      createStripeRequestOptions(key)
    );

  return await retryWithIdempotency(() => createIntent(idempotencyKey));
}

// Destination charges対応の返金処理
export interface CreateDestinationRefundParams {
  paymentIntentId: string;
  amount?: number; // 部分返金時のみ指定
  reason?: Stripe.RefundCreateParams.Reason;
  reverseTransfer?: boolean; // default true
  refundApplicationFee?: boolean; // default true
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

  if (amount !== undefined) {
    refundParams.amount = amount;
  }
  if (reason) {
    refundParams.reason = reason;
  }

  const refundId: string = providedRefundId || (metadata?.refund_id as string | undefined) || randomUUID();
  refundParams.metadata = { ...metadata, refund_id: refundId };

  const idempotencyKey = generateIdempotencyKey('refund', paymentIntentId, refundId);
  const createRefund = () => stripe.refunds.create(refundParams, createStripeRequestOptions(idempotencyKey));
  return await retryWithIdempotency(createRefund);
}

// Charge ID を直接指定して返金するユーティリティ
export interface CreateDestinationRefundByChargeParams {
  chargeId: string;
  amount?: number;
  reason?: Stripe.RefundCreateParams.Reason;
  reverseTransfer?: boolean; // default true
  refundApplicationFee?: boolean; // default true
  refundId?: string;
  metadata?: Record<string, string>;
}

export async function createDestinationRefundByCharge(
  params: CreateDestinationRefundByChargeParams
): Promise<Stripe.Refund> {
  const { chargeId, amount, reason, reverseTransfer = true, refundApplicationFee = true, refundId: providedRefundId, metadata = {} } = params;

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

  const refundId: string = providedRefundId || (metadata?.refund_id as string | undefined) || randomUUID();
  refundParams.metadata = { ...metadata, refund_id: refundId };

  const idempotencyKey = generateIdempotencyKey('refund', chargeId, refundId);
  const createRefund = () => stripe.refunds.create(refundParams, createStripeRequestOptions(idempotencyKey));
  return await retryWithIdempotency(createRefund);
}

// PaymentIntent.latest_charge を取得して返金するユーティリティ
export async function createDestinationRefundLatestCharge(
  params: CreateDestinationRefundParams
): Promise<Stripe.Refund> {
  const { paymentIntentId, amount, reason, reverseTransfer = true, refundApplicationFee = true, metadata = {} } = params;

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] });
  const latestCharge = paymentIntent.latest_charge as unknown as Stripe.Charge | string | null;

  if (latestCharge && typeof latestCharge !== 'string') {
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

  return await createDestinationRefund(params);
}

// Customer作成・取得ヘルパー
export interface CreateOrRetrieveCustomerParams {
  email?: string;
  name?: string;
  metadata?: Record<string, string>;
}

export async function createOrRetrieveCustomer(
  params: CreateOrRetrieveCustomerParams
): Promise<Stripe.Customer> {
  const { email, name, metadata = {} } = params;

  if (email) {
    try {
      const searchResult = await stripe.customers.search({ query: `email:"${email}"`, limit: 1 });
      if (searchResult?.data?.length > 0) {
        return searchResult.data[0] as Stripe.Customer;
      }
    } catch (_e) {
      const existingCustomers = await stripe.customers.list({ email, limit: 1 });
      if (existingCustomers.data.length > 0) {
        return existingCustomers.data[0];
      }
    }
  }

  return await stripe.customers.create({ email, name, metadata });
}
