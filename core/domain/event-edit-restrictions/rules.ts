/**
 * イベント編集制限ドメイン - ルール定義
 */

import {
  type RestrictionRule,
  type RestrictionContext,
  type FormDataSnapshot,
  type RestrictionEvaluation,
  type RestrictableField,
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

/**
 * 値の等価性チェック
 * 型違い、null/空文字、日付の秒数差、文字列の空白を吸収して比較します
 */
const areValuesEqual = (a: unknown, b: unknown): boolean => {
  // 1. 厳密な等価性
  if (a === b) return true;

  // 2. null/undefined/空文字の同一視
  const isEmpty = (v: unknown) => v === null || v === undefined || v === "";
  if (isEmpty(a) && isEmpty(b)) return true;
  if (isEmpty(a) || isEmpty(b)) return false;

  // 3. 数値としての比較
  const numA = safeParseNumber(a);
  const numB = safeParseNumber(b);
  if (numA !== null && numB !== null) {
    return numA === numB;
  }

  // 4. 日付としての比較（秒・ミリ秒を無視して分単位で比較）
  const toDate = (v: unknown): Date | null => {
    if (v instanceof Date) return v;
    if (typeof v === "string" && /^\d{4}[-/]\d{2}[-/]\d{2}/.test(v)) {
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  };

  const dateA = toDate(a);
  const dateB = toDate(b);

  if (dateA && dateB) {
    // タイムスタンプを60000ms（1分）で割って切り捨て、分単位の整数にする
    const minutesA = Math.floor(dateA.getTime() / 60000);
    const minutesB = Math.floor(dateB.getTime() / 60000);
    return minutesA === minutesB;
  }

  // 5. 文字列としての比較（前後の空白を削除して比較）
  return String(a).trim() === String(b).trim();
};

// =============================================================================
// Structural Restrictions - 構造的制限（絶対変更不可）
// =============================================================================

/** 決済済み参加者がいる場合の参加費制限 */
export const STRIPE_PAID_FEE_RESTRICTION: RestrictionRule = {
  id: "stripe_paid_fee_restriction",
  field: "fee",
  level: "structural",
  name: "決済済み参加者による参加費制限",
  evaluate: (context: RestrictionContext, _formData: FormDataSnapshot) => {
    if (context.hasStripePaid) {
      return createEvaluation(
        true,
        "決済済み参加者がいるため、参加費は変更できません",
        `現在${context.attendeeCount}名の参加者のうち、既にオンライン決済を完了した参加者がいます。`
      );
    }

    return createEvaluation(false, "制限なし");
  },
};

/** 参加者がいる場合の決済方法制限 */
export const ATTENDEE_PAYMENT_METHODS_RESTRICTION: RestrictionRule = {
  id: "attendee_payment_methods_restriction",
  field: "payment_methods",
  level: "structural",
  name: "参加者による決済方法制限",
  evaluate: (context: RestrictionContext, formData: FormDataSnapshot) => {
    // 参加者がいなければ制限なし
    if (!context.hasAttendees) {
      return createEvaluation(false, "制限なし");
    }

    // 1. まず実際の違反チェック（削除しようとしたか？）
    const original = new Set((context.originalEvent.payment_methods || []) as string[]);
    const next = new Set((formData.payment_methods || []) as string[]);

    // 追加は許可、既存の解除のみ制限
    for (const method of original) {
      if (!next.has(method)) {
        return createEvaluation(
          true,
          "参加者がいるため、既存の決済方法は解除できません",
          "決済方法を追加することは可能です。"
        );
      }
    }

    // 2. 違反はしていないが、制限自体は存在することをユーザーに伝える（Warning）
    if (original.size > 0) {
      return createWarning(
        "参加者がいるため、既存の決済方法は解除できません（追加は可能）",
        "現在設定されている決済方法は、既に参加者がいるためオフにできません。"
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
    // 参加者がいなければ制限なし
    if (!context.hasAttendees) {
      return createEvaluation(false, "制限なし");
    }

    const newCapacity = safeParseNumber(formData.capacity);

    // 1. 実際の違反チェック
    if (newCapacity !== null && newCapacity > 0 && newCapacity < context.attendeeCount) {
      return createEvaluation(
        true,
        `現在${context.attendeeCount}名の参加者がいるため、定員を${context.attendeeCount}名未満には設定できません`,
        `定員を${newCapacity}名に変更しようとしていますが、既に${context.attendeeCount}名が参加中です。`,
        `定員は${context.attendeeCount}名以上で設定してください。`
      );
    }

    // 2. 違反はしていないが、下限があることを事前に伝える（Warning）
    // これにより、Conditionalセクションに常時条件が表示されます
    return createWarning(
      `現在の参加者数（${context.attendeeCount}名）未満への定員変更はできません`,
      `既に参加者がいるため、定員を減らす場合は${context.attendeeCount}名が下限となります。`
    );
  },
};

// =============================================================================
// Advisory Restrictions - 注意事項（変更可能だが注意が必要）
// =============================================================================

/** 参加者への影響に関する注意喚起 */
export const ATTENDEE_IMPACT_ADVISORY: RestrictionRule = {
  id: "attendee_impact_advisory",
  field: "title",
  level: "advisory",
  name: "参加者への影響注意",
  evaluate: (context: RestrictionContext, formData: FormDataSnapshot) => {
    if (!context.hasAttendees) {
      return createEvaluation(false, "制限なし");
    }

    // 監視対象の重要フィールド
    const criticalFields = ["title", "date", "location", "fee"] as const;

    const hasChanges = criticalFields.some((field) => {
      const current = formData[field];
      const original = (context.originalEvent as Record<string, unknown>)[field];

      // フォームに含まれていないフィールドは無視
      if (current === undefined) return false;

      // 等価性チェックを使用（型やフォーマットの違いを吸収）
      return !areValuesEqual(current, original);
    });

    if (hasChanges) {
      return createWarning(
        "変更内容により参加者に影響が生じる場合があります",
        `現在${context.attendeeCount}名の参加者がいます。イベント情報の変更により参加者に混乱や不利益が生じる可能性があります。`
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
  evaluate: (_context: RestrictionContext, formData: FormDataSnapshot) => {
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
  evaluate: (_context: RestrictionContext, formData: FormDataSnapshot) => {
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

    if (currentDate === undefined) {
      return createEvaluation(false, "制限なし");
    }

    // 等価性チェックを使用
    if (!areValuesEqual(currentDate, originalDate)) {
      return createWarning(
        "開催日時の変更は参加者に大きく影響します",
        `現在${context.attendeeCount}名の参加者が登録済みです。日時の変更により参加できなくなる可能性があります。`
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

    if (
      newCapacity &&
      originalCapacity &&
      newCapacity < originalCapacity &&
      newCapacity >= context.attendeeCount
    ) {
      return createWarning(
        "定員を削減すると新規参加者の登録に影響します",
        `定員を${originalCapacity}名から${newCapacity}名に削減しようとしています。`
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
  STRIPE_PAID_FEE_RESTRICTION,
  ATTENDEE_PAYMENT_METHODS_RESTRICTION,
  ATTENDEE_COUNT_CAPACITY_RESTRICTION,
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
