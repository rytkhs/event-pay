/**
 * 制限システム - 公開API
 */

import type {
  RestrictionContext,
  FormDataSnapshot,
  RestrictionState,
  RestrictionLevel,
  RestrictableField,
  FieldRestrictionMap,
} from "./types";

// =============================================================================
// Core Exports - コア機能のエクスポート
// =============================================================================

// 型定義
export type {
  RestrictionLevel,
  RestrictionStatus,
  RestrictableField,
  RestrictionContext,
  FormDataSnapshot,
  RestrictionRule,
  RestrictionEvaluation,
  ActiveRestriction,
  RestrictionState,
  FieldRestrictionSummary,
  RestrictionChangeEvent,
  RestrictionErrorEvent,
  RestrictionEngineConfig,
  RestrictionsOfLevel,
  FieldRestrictionMap,
  RestrictionRuleDictionary,
} from "./types";

// 制限ルール
export {
  // 個別ルール
  STRIPE_PAID_FEE_RESTRICTION,
  STRIPE_PAID_PAYMENT_METHODS_RESTRICTION,
  ATTENDEE_COUNT_CAPACITY_RESTRICTION,
  ATTENDEE_IMPACT_ADVISORY,
  FREE_EVENT_PAYMENT_ADVISORY,
  PAID_EVENT_PAYMENT_REQUIRED_ADVISORY,
  DATE_CHANGE_ADVISORY,
  CAPACITY_REDUCTION_ADVISORY,

  // ルールコレクション
  ALL_RESTRICTION_RULES,
  RESTRICTION_RULES_BY_LEVEL,
  RESTRICTION_RULES_BY_FIELD,

  // ユーティリティ
  getRuleById,
  getRulesForField,
  getRulesByLevel,
} from "./rules";

// 制限エンジン
export { RestrictionEngine, createRestrictionEngine, createDebugRestrictionEngine } from "./engine";

// =============================================================================
// Convenience Functions - 便利機能
// =============================================================================

/**
 * 制限コンテキストビルダー - RestrictionContext の構築ヘルパー
 */
export function buildRestrictionContext(
  event: {
    fee?: number | null;
    capacity?: number | null;
    payment_methods?: string[];
    title?: string;
    description?: string;
    location?: string;
    date?: string;
    registration_deadline?: string;
    payment_deadline?: string;
    allow_payment_after_deadline?: boolean;
    grace_period_days?: number;
  },
  attendanceInfo: {
    hasAttendees: boolean;
    attendeeCount: number;
    hasStripePaid: boolean;
  },
  eventStatus: "upcoming" | "ongoing" | "past" | "canceled" = "upcoming"
): RestrictionContext {
  return {
    ...attendanceInfo,
    eventStatus,
    originalEvent: {
      fee: event.fee ?? null,
      capacity: event.capacity ?? null,
      payment_methods: event.payment_methods ?? [],
      title: event.title,
      description: event.description,
      location: event.location,
      date: event.date,
      registration_deadline: event.registration_deadline,
      payment_deadline: event.payment_deadline,
      allow_payment_after_deadline: event.allow_payment_after_deadline,
      grace_period_days: event.grace_period_days,
    },
  };
}

/**
 * フォームデータスナップショット - FormDataSnapshot の構築ヘルパー
 */
export function createFormDataSnapshot(formValues: Record<string, unknown>): FormDataSnapshot {
  return {
    fee: formValues.fee as string | number | undefined,
    capacity: formValues.capacity as string | number | undefined,
    payment_methods: formValues.payment_methods as string[] | undefined,
    title: formValues.title as string | undefined,
    description: formValues.description as string | undefined,
    location: formValues.location as string | undefined,
    date: formValues.date as string | undefined,
    registration_deadline: formValues.registration_deadline as string | undefined,
    payment_deadline: formValues.payment_deadline as string | undefined,
    allow_payment_after_deadline: formValues.allow_payment_after_deadline as boolean | undefined,
    grace_period_days: formValues.grace_period_days as string | number | undefined,
    ...formValues,
  };
}

/**
 * 制限状態の簡易チェック - 特定レベルの制限が存在するかチェック
 */
export function hasRestrictionsOfLevel(
  restrictionState: RestrictionState,
  level: RestrictionLevel
): boolean {
  return restrictionState[level].length > 0;
}

/**
 * フィールドの編集可能性チェック - フィールドが編集可能かチェック
 */
export function isFieldEditable(
  field: RestrictableField,
  fieldRestrictions: FieldRestrictionMap
): boolean {
  const summary = fieldRestrictions.get(field);
  return summary?.isEditable ?? true;
}

/**
 * 制限メッセージの取得 - フィールドの制限メッセージを取得
 */
export function getFieldRestrictionMessage(
  field: RestrictableField,
  fieldRestrictions: FieldRestrictionMap
): string | null {
  const summary = fieldRestrictions.get(field);
  if (!summary || summary.activeRestrictions.length === 0) {
    return null;
  }

  // 最も重要な制限のメッセージを返す
  const structuralRestriction = summary.activeRestrictions.find(
    (r) => r.rule.level === "structural"
  );
  if (structuralRestriction) {
    return structuralRestriction.evaluation.message;
  }

  const conditionalRestriction = summary.activeRestrictions.find(
    (r) => r.rule.level === "conditional"
  );
  if (conditionalRestriction) {
    return conditionalRestriction.evaluation.message;
  }

  const advisoryRestriction = summary.activeRestrictions.find((r) => r.rule.level === "advisory");
  return advisoryRestriction?.evaluation.message ?? null;
}
