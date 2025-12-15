/**
 * イベント編集制限ドメイン - 公開API
 */

import type {
  RestrictionState,
  RestrictionLevel,
  RestrictableField,
  FieldRestrictionMap,
} from "./types";

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

export {
  STRIPE_PAID_FEE_RESTRICTION,
  ATTENDEE_PAYMENT_METHODS_RESTRICTION,
  ATTENDEE_COUNT_CAPACITY_RESTRICTION,
  ATTENDEE_IMPACT_ADVISORY,
  FREE_EVENT_PAYMENT_ADVISORY,
  PAID_EVENT_PAYMENT_REQUIRED_ADVISORY,
  DATE_CHANGE_ADVISORY,
  CAPACITY_REDUCTION_ADVISORY,
  ALL_RESTRICTION_RULES,
  RESTRICTION_RULES_BY_LEVEL,
  RESTRICTION_RULES_BY_FIELD,
  getRuleById,
  getRulesForField,
  getRulesByLevel,
} from "./rules";

export { RestrictionEngine, createRestrictionEngine, createDebugRestrictionEngine } from "./engine";

export {
  evaluateEventEditViolations,
  type FieldViolation,
  type EvaluateEventEditViolationsParams,
  buildRestrictionContext,
  createFormDataSnapshot,
} from "./evaluate";

/** 制限状態の簡易チェック */
export function hasRestrictionsOfLevel(
  restrictionState: RestrictionState,
  level: RestrictionLevel
): boolean {
  return restrictionState[level].length > 0;
}

/** フィールドの編集可能性チェック */
export function isFieldEditable(
  field: RestrictableField,
  fieldRestrictions: FieldRestrictionMap
): boolean {
  const summary = fieldRestrictions.get(field);
  return summary?.isEditable ?? true;
}

/** フィールドの制限メッセージを取得 */
export function getFieldRestrictionMessage(
  field: RestrictableField,
  fieldRestrictions: FieldRestrictionMap
): string | null {
  const summary = fieldRestrictions.get(field);
  if (!summary || summary.activeRestrictions.length === 0) {
    return null;
  }

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
