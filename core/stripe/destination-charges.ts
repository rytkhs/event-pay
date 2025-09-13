import Stripe from "stripe";

import { getTransferGroupForEvent } from "@core/utils/stripe";

import { stripe, generateIdempotencyKey, createStripeRequestOptions } from "./client";
import { retryWithIdempotency } from "./idempotency-retry";

// Destination charges用のCheckout Session作成パラメータ（内部専用）
interface CreateDestinationCheckoutParams {
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
  setupFutureUsage?: "off_session";
  idempotencyKey?: string; // 既存キーの再利用用（任意）
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
    idempotencyKey,
  } = params;

  if (platformFeeAmount >= amount) {
    throw new Error(
      `application_fee_amount (${platformFeeAmount}) must be less than amount (${amount}).`
    );
  }

  const transferGroup = getTransferGroupForEvent(eventId);

  const sessionMetadata = {
    event_id: eventId,
    actor_id: actorId,
    ...metadata,
  };

  const resolvedKey = idempotencyKey ?? generateIdempotencyKey("checkout");

  const createSession = () => {
    return stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "jpy",
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
          // Stripe は生の {CHECKOUT_SESSION_ID} を置換するため、URLSearchParams でエンコードせず連結する
          const hasQuery = successUrl.includes("?");
          const separator = hasQuery ? "&" : "?";
          return `${successUrl}${separator}session_id={CHECKOUT_SESSION_ID}`;
        })(),
        // cancel 側はテンプレート置換の保証がないため、そのまま渡す
        cancel_url: cancelUrl,
        payment_intent_data: {
          // MVPではon_behalf_ofを使用しない（接続先はtransfersのみ要求）
          // on_behalf_of: destinationAccountId,
          transfer_data: { destination: destinationAccountId },
          application_fee_amount: platformFeeAmount,
          transfer_group: transferGroup,
          metadata: sessionMetadata,
          ...(setupFutureUsage ? { setup_future_usage: setupFutureUsage } : {}),
        },
        metadata: sessionMetadata,
      },
      createStripeRequestOptions(resolvedKey)
    );
  };

  return await retryWithIdempotency(createSession);
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
