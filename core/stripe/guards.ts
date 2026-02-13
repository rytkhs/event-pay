/**
 * Stripeオブジェクト型ガードユーティリティ
 * Non-null assertionを排除し、適切な型チェックとエラーハンドリングを提供
 */

import Stripe from "stripe";

import { handleServerError } from "@core/utils/error-handler.server";

/**
 * 基本的なStripeオブジェクトの型ガード
 * idプロパティを持つオブジェクトであることを保証
 */
function isStripeObject(obj: unknown): obj is { id: string } {
  return (
    typeof obj === "object" &&
    obj !== null &&
    typeof (obj as { id?: unknown }).id === "string" &&
    (obj as { id: string }).id.length > 0
  );
}
/**
 * 安全にPaymentIntent IDを取得するヘルパー
 * Checkout SessionやChargeなどに含まれる payment_intent プロパティを安全に取り出す
 * 文字列の場合と、Expandされてオブジェクトになっている場合の両方に対応
 */
export function getPaymentIntentId(obj: unknown): string | null {
  if (!isStripeObject(obj)) return null;

  const val = (obj as { payment_intent?: unknown }).payment_intent;

  if (typeof val === "string" && val.length > 0) return val;
  if (isStripeObject(val)) return val.id; // Expandされている場合

  return null;
}

/**
 * 安全にMetadataを取得するヘルパー
 */
export function getMetadata(obj: unknown): Stripe.Metadata | null {
  if (!obj || typeof obj !== "object") return null;
  const metadata = (obj as { metadata?: unknown }).metadata;

  if (metadata && typeof metadata === "object") {
    return metadata as Stripe.Metadata;
  }
  return null;
}

/**
 * Stripe Paymentオブジェクトのアサーション
 */
export function assertStripePayment(obj: unknown, context?: string): asserts obj is { id: string } {
  if (!isStripeObject(obj)) {
    const errorMessage = `Invalid Stripe payment object${context ? ` in ${context}` : ""}`;
    handleServerError("STRIPE_CONFIG_ERROR", {
      category: "system",
      action: "stripe_guard_check",
      actorType: "system",
      additionalData: {
        errorMessage,
        context,
        object_type: typeof obj,
        has_id: obj && typeof obj === "object" ? (obj as { id?: unknown }).id : "missing",
      },
    });
    throw new Error(errorMessage);
  }
}
