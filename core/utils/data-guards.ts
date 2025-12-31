/**
 * データ操作用型ガードユーティリティ
 * UI層でのnon-null assertionを排除し、適切な型チェックを提供
 */

import { logger } from "@core/logging/app-logger";

/**
 * Payment IDを持つオブジェクトの型ガード
 */
export function hasPaymentId(item: any): item is { payment_id: string } {
  return (
    item &&
    typeof item === "object" &&
    typeof item.payment_id === "string" &&
    item.payment_id.length > 0
  );
}

/**
 * Payment IDの配列から有効なIDのみを抽出
 */
export function extractValidPaymentIds(items: any[]): string[] {
  if (!Array.isArray(items)) {
    logger.warn("Invalid items array provided to extractValidPaymentIds", {
      category: "system",
      action: "data_guard_check",
      actor_type: "system",
      items_type: typeof items,
      outcome: "failure",
    });
    return [];
  }

  const validIds = items.filter(hasPaymentId).map((item) => item.payment_id);

  const skippedCount = items.length - validIds.length;
  if (skippedCount > 0) {
    logger.warn(`Skipped ${skippedCount} items without valid payment_id`, {
      category: "system",
      action: "data_guard_check",
      actor_type: "system",
      total_items: items.length,
      valid_items: validIds.length,
      skipped_items: skippedCount,
      outcome: "success",
    });
  }

  return validIds;
}

/**
 * IDを持つオブジェクトの型ガード（汎用）
 */
export function hasId(item: any): item is { id: string } {
  return item && typeof item === "object" && typeof item.id === "string" && item.id.length > 0;
}

/**
 * 必須プロパティチェック（汎用）
 */
export function hasRequiredProperty<T = string>(
  obj: any,
  property: string,
  type: "string" | "number" | "boolean" = "string"
): obj is Record<string, T> {
  return (
    obj &&
    typeof obj === "object" &&
    property in obj &&
    typeof obj[property] === type &&
    (type === "string"
      ? (obj[property] as string).length > 0
      : obj[property] !== null && obj[property] !== undefined)
  );
}

/**
 * 配列の有効性チェック
 */
export function isValidArray<T>(
  value: any,
  itemValidator?: (item: any) => item is T
): value is T[] {
  if (!Array.isArray(value)) {
    return false;
  }

  if (itemValidator) {
    return value.every(itemValidator);
  }

  return true;
}

/**
 * 安全な配列フィルタリング
 */
export function safeFilter<T>(
  items: any[],
  predicate: (item: any) => item is T,
  context?: string
): T[] {
  if (!Array.isArray(items)) {
    logger.warn(`Invalid array provided to safeFilter${context ? ` in ${context}` : ""}`, {
      category: "system",
      action: "data_guard_check",
      actor_type: "system",
      items_type: typeof items,
      context,
      outcome: "failure",
    });
    return [];
  }

  return items.filter(predicate);
}

/**
 * 安全な配列マッピング
 */
export function safeMap<T, R>(
  items: any[],
  mapper: (item: T) => R,
  validator: (item: any) => item is T,
  context?: string
): R[] {
  const validItems = safeFilter(items, validator, context);
  return validItems.map(mapper);
}
