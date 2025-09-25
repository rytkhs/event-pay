/**
 * 制限ルール定義 - 具体的な制限ロジック
 */

import {
  RestrictionRule,
  RestrictionContext,
  FormDataSnapshot,
  RestrictionEvaluation,
  RestrictableField,
} from "./types";

// =============================================================================
// Rule Implementation Helpers - ルール実装のヘルパー関数
// =============================================================================

/** 数値の安全な変換 */
const safeParseNumber = (value: unknown): number | null => {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

/** 制限評価結果の生成ヘルパー */
const createEvaluation = (
  isRestricted: boolean,
  message: string,
  details?: string,
  suggestedAction?: string
): RestrictionEvaluation => ({
  isRestricted,
  status: isRestricted ? "restricted" : "allowed",
  message,
  details,
  suggestedAction,
});

const createWarning = (
  message: string,
  details?: string,
  suggestedAction?: string
): RestrictionEvaluation => ({
  isRestricted: false,
  status: "warning",
  message,
  details,
  suggestedAction,
});

// =============================================================================
// Structural Restrictions - 構造的制限（絶対変更不可）
// =============================================================================

/** 決済済み参加者がいる場合の参加費制限 */
export const STRIPE_PAID_FEE_RESTRICTION: RestrictionRule = {
  id: "stripe_paid_fee_restriction",
  field: "fee",
  level: "structural",
  name: "決済済み参加者による参加費制限",
  evaluate: (context: RestrictionContext, formData: FormDataSnapshot) => {
    if (!context.hasStripePaid) {
      return createEvaluation(false, "制限なし");
    }

    // フォームデータの参加費と元の参加費を比較
    const currentFee = safeParseNumber(formData.fee) ?? 0;
    const originalFee = context.originalEvent.fee ?? 0;

    if (currentFee !== originalFee) {
      return createEvaluation(
        true,
        "決済済み参加者がいるため、参加費は変更できません",
        `現在${context.attendeeCount}名の参加者のうち、既にクレジットカード決済を完了した参加者がいます。`,
        "参加費を変更する場合は、決済済み参加者への返金処理が必要になります。"
      );
    }

    return createEvaluation(false, "制限なし");
  },
};

/** 決済済み参加者がいる場合の決済方法制限 */
export const STRIPE_PAID_PAYMENT_METHODS_RESTRICTION: RestrictionRule = {
  id: "stripe_paid_payment_methods_restriction",
  field: "payment_methods",
  level: "structural",
  name: "決済済み参加者による決済方法制限",
  evaluate: (context: RestrictionContext, formData: FormDataSnapshot) => {
    if (!context.hasStripePaid) {
      return createEvaluation(false, "制限なし");
    }

    // 配列の内容比較（順序無視）
    const currentMethods = new Set(formData.payment_methods || []);
    const originalMethods = new Set(context.originalEvent.payment_methods || []);

    const hasChanges =
      currentMethods.size !== originalMethods.size ||
      !Array.from(currentMethods).every((method) => originalMethods.has(method));

    if (hasChanges) {
      return createEvaluation(
        true,
        "決済済み参加者がいるため、決済方法は変更できません",
        "クレジットカード決済を完了した参加者がいるため、決済方法の変更はできません。",
        "決済方法を変更する場合は、決済済み参加者への対応が必要になります。"
      );
    }

    return createEvaluation(false, "制限なし");
  },
};

// =============================================================================
// Conditional Restrictions - 条件的制限（条件下で変更不可）
// =============================================================================

/** 参加者数による定員制限 */
export const ATTENDEE_COUNT_CAPACITY_RESTRICTION: RestrictionRule = {
  id: "attendee_count_capacity_restriction",
  field: "capacity",
  level: "conditional",
  name: "参加者数による定員制限",
  evaluate: (context: RestrictionContext, formData: FormDataSnapshot) => {
    if (!context.hasAttendees) {
      return createEvaluation(false, "制限なし");
    }

    const newCapacity = safeParseNumber(formData.capacity);

    // 定員未設定（無制限）の場合は制限なし
    if (newCapacity === null || newCapacity === 0) {
      return createEvaluation(false, "制限なし（定員無制限）");
    }

    // 新定員が現在の参加者数未満の場合は制限
    if (newCapacity < context.attendeeCount) {
      return createEvaluation(
        true,
        `現在${context.attendeeCount}名の参加者がいるため、定員を${context.attendeeCount}名未満には設定できません`,
        `定員を${newCapacity}名に変更しようとしていますが、既に${context.attendeeCount}名が参加中です。`,
        `定員は${context.attendeeCount}名以上で設定するか、参加者を減らしてから定員を変更してください。`
      );
    }

    return createEvaluation(false, "制限なし");
  },
};

// =============================================================================
// Advisory Restrictions - 注意事項（変更可能だが注意が必要）
// =============================================================================

/** 参加者への影響に関する注意喚起 */
export const ATTENDEE_IMPACT_ADVISORY: RestrictionRule = {
  id: "attendee_impact_advisory",
  field: "title", // 代表的なフィールドとして設定
  level: "advisory",
  name: "参加者への影響注意",
  evaluate: (context: RestrictionContext, formData: FormDataSnapshot) => {
    if (!context.hasAttendees) {
      return createEvaluation(false, "制限なし");
    }

    // 重要フィールドの変更をチェック
    const criticalFields = ["title", "date", "location", "fee"] as const;
    const hasChanges = criticalFields.some((field) => {
      const current = formData[field];
      const original = (context.originalEvent as any)[field];
      return current !== original && current !== null && current !== undefined && current !== "";
    });

    if (hasChanges) {
      return createWarning(
        "変更内容により参加者に影響が生じる場合があります",
        `現在${context.attendeeCount}名の参加者がいます。イベント情報の変更により参加者に混乱や不利益が生じる可能性があります。`,
        "重要な変更を行った場合は、参加者への個別連絡を検討してください。"
      );
    }

    return createEvaluation(false, "制限なし");
  },
};

/** 無料イベントの決済方法に関する注意 */
export const FREE_EVENT_PAYMENT_ADVISORY: RestrictionRule = {
  id: "free_event_payment_advisory",
  field: "payment_methods",
  level: "advisory",
  name: "無料イベント決済方法注意",
  evaluate: (context: RestrictionContext, formData: FormDataSnapshot) => {
    const fee = safeParseNumber(formData.fee) ?? 0;
    const paymentMethods = formData.payment_methods || [];

    if (fee === 0 && paymentMethods.length > 0) {
      return createWarning(
        "参加費が0円のため、決済方法の設定は不要です",
        "無料イベントでは決済手続きが発生しないため、決済方法を設定する必要はありません。",
        "決済方法の設定を削除することをお勧めします。"
      );
    }

    return createEvaluation(false, "制限なし");
  },
};

/** 有料イベントの決済方法必須チェック */
export const PAID_EVENT_PAYMENT_REQUIRED_ADVISORY: RestrictionRule = {
  id: "paid_event_payment_required_advisory",
  field: "payment_methods",
  level: "advisory",
  name: "有料イベント決済方法必須",
  evaluate: (context: RestrictionContext, formData: FormDataSnapshot) => {
    const fee = safeParseNumber(formData.fee) ?? 0;
    const paymentMethods = formData.payment_methods || [];

    if (fee > 0 && paymentMethods.length === 0) {
      return createWarning(
        "有料イベントでは決済方法の選択が必要です",
        `参加費${fee}円が設定されていますが、決済方法が選択されていません。`,
        "クレジットカードまたは現金での決済方法を選択してください。"
      );
    }

    return createEvaluation(false, "制限なし");
  },
};

/** 日時変更の注意 */
export const DATE_CHANGE_ADVISORY: RestrictionRule = {
  id: "date_change_advisory",
  field: "date",
  level: "advisory",
  name: "イベント日時変更注意",
  evaluate: (context: RestrictionContext, formData: FormDataSnapshot) => {
    if (!context.hasAttendees) {
      return createEvaluation(false, "制限なし");
    }

    const currentDate = formData.date;
    const originalDate = context.originalEvent.date;

    if (currentDate && originalDate && currentDate !== originalDate) {
      return createWarning(
        "イベント日時の変更は参加者に大きく影響します",
        `現在${context.attendeeCount}名の参加者が登録済みです。日時の変更により参加できなくなる可能性があります。`,
        "日時を変更する場合は、必ず参加者全員に事前に連絡し、都合を確認してください。"
      );
    }

    return createEvaluation(false, "制限なし");
  },
};

/** 定員削減の注意 */
export const CAPACITY_REDUCTION_ADVISORY: RestrictionRule = {
  id: "capacity_reduction_advisory",
  field: "capacity",
  level: "advisory",
  name: "定員削減注意",
  evaluate: (context: RestrictionContext, formData: FormDataSnapshot) => {
    if (!context.hasAttendees) {
      return createEvaluation(false, "制限なし");
    }

    const newCapacity = safeParseNumber(formData.capacity);
    const originalCapacity = context.originalEvent.capacity;

    // 新定員が設定されていて、元の定員より小さい場合（ただし参加者数以上）
    if (
      newCapacity &&
      originalCapacity &&
      newCapacity < originalCapacity &&
      newCapacity >= context.attendeeCount
    ) {
      return createWarning(
        "定員を削減すると新規参加者の登録に影響します",
        `定員を${originalCapacity}名から${newCapacity}名に削減しようとしています。`,
        "定員削減により新規参加者が登録できなくなる可能性があります。必要に応じて既存参加者への告知を検討してください。"
      );
    }

    return createEvaluation(false, "制限なし");
  },
};

// =============================================================================
// Rule Collections - ルールコレクション
// =============================================================================

/** 全制限ルール */
export const ALL_RESTRICTION_RULES: RestrictionRule[] = [
  // 構造的制限
  STRIPE_PAID_FEE_RESTRICTION,
  STRIPE_PAID_PAYMENT_METHODS_RESTRICTION,

  // 条件的制限
  ATTENDEE_COUNT_CAPACITY_RESTRICTION,

  // 注意事項
  ATTENDEE_IMPACT_ADVISORY,
  FREE_EVENT_PAYMENT_ADVISORY,
  PAID_EVENT_PAYMENT_REQUIRED_ADVISORY,
  DATE_CHANGE_ADVISORY,
  CAPACITY_REDUCTION_ADVISORY,
];

/** 制限レベル別ルール */
export const RESTRICTION_RULES_BY_LEVEL = {
  structural: ALL_RESTRICTION_RULES.filter((rule) => rule.level === "structural"),
  conditional: ALL_RESTRICTION_RULES.filter((rule) => rule.level === "conditional"),
  advisory: ALL_RESTRICTION_RULES.filter((rule) => rule.level === "advisory"),
};

/** フィールド別ルール */
export const RESTRICTION_RULES_BY_FIELD = ALL_RESTRICTION_RULES.reduce(
  (acc, rule) => {
    if (!acc[rule.field]) {
      acc[rule.field] = [];
    }
    acc[rule.field].push(rule);
    return acc;
  },
  {} as Record<RestrictableField, RestrictionRule[]>
);

// =============================================================================
// Rule Utilities - ルールユーティリティ
// =============================================================================

/** ルールIDでルールを取得 */
export const getRuleById = (id: string): RestrictionRule | undefined => {
  return ALL_RESTRICTION_RULES.find((rule) => rule.id === id);
};

/** フィールドに適用されるルールを取得 */
export const getRulesForField = (field: RestrictableField): RestrictionRule[] => {
  return RESTRICTION_RULES_BY_FIELD[field] || [];
};

/** 制限レベルのルールを取得 */
export const getRulesByLevel = (
  level: "structural" | "conditional" | "advisory"
): RestrictionRule[] => {
  return RESTRICTION_RULES_BY_LEVEL[level];
};
