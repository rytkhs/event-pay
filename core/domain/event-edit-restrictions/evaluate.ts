/**
 * イベント編集制限ドメイン - 評価ヘルパー
 */

import { createRestrictionEngine, RestrictionEngine } from "./engine";
import {
  type RestrictionContext,
  type FormDataSnapshot,
  type RestrictableField,
  type RestrictionLevel,
  type ActiveRestriction,
} from "./types";

/** violation 表現 */
export interface FieldViolation {
  field: RestrictableField;
  level: RestrictionLevel;
  ruleId: string;
  message: string;
  details?: string;
  suggestedAction?: string;
}

export interface EvaluateEventEditViolationsParams {
  context: RestrictionContext;
  formData: FormDataSnapshot;
  patch: Record<string, unknown>;
  engine?: RestrictionEngine;
}

const RESTRICTABLE_FIELDS: RestrictableField[] = [
  "fee",
  "payment_methods",
  "capacity",
  "title",
  "description",
  "location",
  "date",
  "registration_deadline",
  "payment_deadline",
  "allow_payment_after_deadline",
  "grace_period_days",
];

const RESTRICTABLE_FIELD_SET = new Set(RESTRICTABLE_FIELDS);

const SEVERITY_ORDER: RestrictionLevel[] = ["structural", "conditional", "advisory"];

const defaultEngine = createRestrictionEngine({ enableCache: false });

const isRestrictableField = (field: string): field is RestrictableField => {
  return RESTRICTABLE_FIELD_SET.has(field as RestrictableField);
};

const getPatchFields = (patch: Record<string, unknown>): RestrictableField[] => {
  return (Object.keys(patch) as string[])
    .filter((key) => isRestrictableField(key))
    .filter((key) => patch[key] !== undefined) as RestrictableField[];
};

const pickHighestPriorityRestriction = (
  restrictions: ActiveRestriction[]
): ActiveRestriction | null => {
  for (const level of SEVERITY_ORDER) {
    const matched = restrictions.find((restriction) => restriction.rule.level === level);
    if (matched) {
      return matched;
    }
  }
  return null;
};

export async function evaluateEventEditViolations({
  context,
  formData,
  patch,
  engine = defaultEngine,
}: EvaluateEventEditViolationsParams): Promise<FieldViolation[]> {
  const fields = getPatchFields(patch);
  if (fields.length === 0) {
    return [];
  }

  const fieldRestrictions = await engine.getFieldRestrictions(context, formData);
  const violations: FieldViolation[] = [];

  for (const field of fields) {
    const summary = fieldRestrictions.get(field);
    if (!summary || summary.isEditable) {
      continue;
    }

    const primaryRestriction = pickHighestPriorityRestriction(summary.activeRestrictions);
    if (!primaryRestriction) {
      continue;
    }

    violations.push({
      field,
      level: primaryRestriction.rule.level,
      ruleId: primaryRestriction.rule.id,
      message: primaryRestriction.evaluation.message,
      details: primaryRestriction.evaluation.details,
      suggestedAction: primaryRestriction.evaluation.suggestedAction,
    });
  }

  return violations;
}

/**
 * RestrictionContext を構築
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
 * FormDataSnapshot を生成
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
