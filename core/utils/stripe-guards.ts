/**
 * Stripeオブジェクト型ガードユーティリティ
 * Non-null assertionを排除し、適切な型チェックとエラーハンドリングを提供
 */

import { handleServerError } from "@core/utils/error-handler.server";

/**
 * Stripe Paymentオブジェクトの型ガード
 */
export function isValidStripePayment(obj: any): obj is { id: string } {
  return obj && typeof obj === "object" && typeof obj.id === "string" && obj.id.length > 0;
}

/**
 * Stripe Paymentオブジェクトのアサーション
 */
export function assertStripePayment(obj: any, context?: string): asserts obj is { id: string } {
  if (!isValidStripePayment(obj)) {
    const errorMessage = `Invalid Stripe payment object${context ? ` in ${context}` : ""}`;
    handleServerError("STRIPE_CONFIG_ERROR", {
      category: "system",
      action: "stripe_guard_check",
      actorType: "system",
      additionalData: {
        errorMessage,
        context,
        object_type: typeof obj,
        has_id: obj && typeof obj === "object" ? typeof obj.id : "missing",
      },
    });
    throw new Error(errorMessage);
  }
}

/**
 * Stripe Sessionオブジェクトの型ガード
 */
export function isValidStripeSession(obj: any): obj is { metadata?: Record<string, string> } {
  return obj && typeof obj === "object";
}

/**
 * Stripe Sessionのメタデータ型ガード
 */
export function hasStripeSessionMetadata(
  session: any,
  key: string
): session is { metadata: Record<string, string> } {
  return (
    session &&
    typeof session === "object" &&
    session.metadata &&
    typeof session.metadata === "object" &&
    typeof session.metadata[key] === "string" &&
    session.metadata[key].length > 0
  );
}

/**
 * Stripe Sessionメタデータの安全な取得
 */
export function getStripeSessionMetadata(session: any, key: string): string {
  if (!hasStripeSessionMetadata(session, key)) {
    const errorMessage = `Missing or invalid metadata key '${key}' in Stripe session`;
    handleServerError("STRIPE_CONFIG_ERROR", {
      category: "system",
      action: "stripe_guard_check",
      actorType: "system",
      additionalData: {
        errorMessage,
        key,
        has_metadata: session?.metadata ? "yes" : "no",
        metadata_type: typeof session?.metadata,
      },
    });
    throw new Error(errorMessage);
  }
  return session.metadata[key];
}

/**
 * 汎用オブジェクトプロパティの型ガード
 */
export function hasProperty<T = string>(
  obj: any,
  property: string,
  expectedType: "string" | "number" | "boolean" = "string"
): obj is Record<string, T> {
  return (
    obj &&
    typeof obj === "object" &&
    property in obj &&
    typeof obj[property] === expectedType &&
    (expectedType === "string" ? obj[property].length > 0 : true)
  );
}

/**
 * 必須プロパティの安全な取得
 */
export function getRequiredProperty<T = string>(
  obj: any,
  property: string,
  expectedType: "string" | "number" | "boolean" = "string",
  context?: string
): T {
  if (!hasProperty<T>(obj, property, expectedType)) {
    const errorMessage = `Missing or invalid property '${property}' (expected ${expectedType})${
      context ? ` in ${context}` : ""
    }`;
    handleServerError("STRIPE_CONFIG_ERROR", {
      category: "system",
      action: "stripe_guard_check",
      actorType: "system",
      additionalData: {
        errorMessage,
        property,
        expected_type: expectedType,
        actual_type:
          obj && typeof obj === "object" && property in obj ? typeof obj[property] : "missing",
        context,
      },
    });
    throw new Error(errorMessage);
  }
  return obj[property] as T;
}
