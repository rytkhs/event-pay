import type { Database } from "@/types/database";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type AttendanceRow = Database["public"]["Tables"]["attendances"]["Row"];

export interface EventWithAttendances extends EventRow {
  attendances: AttendanceRow[];
}

export interface EditRestrictionViolation {
  field: string;
  message: string;
}

/**
 * 制限チェックのコンテキスト情報
 */
interface RestrictionContext {
  operation: "update" | "delete" | "payment_change" | "capacity_change";
  attendeeCount: number;
  hasActivePayments?: boolean;
}

/**
 * 制限ルールの定義
 */
interface RestrictionRule {
  field: string;
  check: (existingValue: unknown, newValue: unknown, context: RestrictionContext) => boolean;
  message: string | ((context: RestrictionContext) => string);
}

/**
 * 型安全なフィールド値取得ヘルパー
 */
function getFieldValue(
  obj: EventRow | Partial<EventRow> | EventWithAttendances,
  fieldName: string
): EventRow[keyof EventRow] | EventRow | undefined {
  switch (fieldName) {
    case "title":
      return obj.title;
    case "description":
      return obj.description;
    case "location":
      return obj.location;
    case "date":
      return obj.date;
    case "fee":
      return obj.fee;
    case "capacity":
      return obj.capacity;
    case "payment_methods":
      return obj.payment_methods;
    case "registration_deadline":
      return obj.registration_deadline;
    case "payment_deadline":
      return obj.payment_deadline;
    case "event":
      return obj as EventRow; // 削除操作用
    default:
      return undefined;
  }
}

/**
 * 汎用的なイベント制限チェック機能
 */
function checkEventRestrictions(
  existingEvent: EventWithAttendances,
  newData: Partial<EventRow>,
  context: RestrictionContext
): EditRestrictionViolation[] {
  const violations: EditRestrictionViolation[] = [];

  if (context.attendeeCount === 0) {
    return violations; // 参加者がいない場合は制限なし
  }

  // 操作別の制限ルール
  const rules = getRestrictionRules(context.operation);

  for (const rule of rules) {
    // 型安全なフィールドアクセス
    const existingValue = getFieldValue(existingEvent, rule.field);
    const newValue = getFieldValue(newData, rule.field);

    // 削除操作の場合は newValue が undefined でもチェックを実行
    const shouldCheck =
      context.operation === "delete" ? rule.field === "event" : newValue !== undefined;

    if (shouldCheck && rule.check(existingValue, newValue, context)) {
      violations.push({
        field: rule.field,
        message: typeof rule.message === "function" ? rule.message(context) : rule.message,
      });
    }
  }

  return violations;
}

/**
 * 操作別の制限ルールを取得
 */
function getRestrictionRules(operation: RestrictionContext["operation"]): RestrictionRule[] {
  const commonRules: RestrictionRule[] = [
    {
      field: "title",
      check: (existing, updated) => existing !== updated,
      message: "参加者がいるため、イベント名は変更できません",
    },
    {
      field: "fee",
      check: (existing, updated) => existing !== updated,
      message: "参加者がいるため、参加費は変更できません",
    },
    {
      field: "payment_methods",
      check: (existing, updated) => {
        const currentMethods =
          (existing as Database["public"]["Enums"]["payment_method_enum"][]) || [];
        const newMethods = (updated as Database["public"]["Enums"]["payment_method_enum"][]) || [];
        return (
          newMethods.length !== currentMethods.length ||
          !newMethods.every((method) => currentMethods.includes(method))
        );
      },
      message: "参加者がいるため、決済方法は変更できません",
    },
  ];

  const updateRules: RestrictionRule[] = [
    ...commonRules,
    {
      field: "date",
      check: (existing, updated) => existing !== updated,
      message: "参加者がいるため、開催日時は変更できません",
    },
    {
      field: "capacity",
      check: (existing, updated, context) => {
        const currentCapacity = (existing as number) || 999999;
        const newCapacity = updated as number;
        return (
          newCapacity !== null &&
          newCapacity < currentCapacity &&
          newCapacity < context.attendeeCount
        );
      },
      message: (context) =>
        `参加者が${context.attendeeCount}名いるため、定員を${context.attendeeCount}名未満に減らすことはできません`,
    },
  ];

  const deleteRules: RestrictionRule[] = [
    {
      field: "event",
      check: (existing, updated, context) => context.attendeeCount > 0,
      message: (context) => `参加者が${context.attendeeCount}名いるため、イベントを削除できません`,
    },
  ];

  const paymentChangeRules: RestrictionRule[] = [
    {
      field: "fee",
      check: (existing, updated, context) =>
        existing !== updated && (context.hasActivePayments || false),
      message: "決済済みの参加者がいるため、参加費は変更できません",
    },
    {
      field: "payment_methods",
      check: (existing, updated, context) => {
        if (!(context.hasActivePayments || false)) return false;
        const currentMethods =
          (existing as Database["public"]["Enums"]["payment_method_enum"][]) || [];
        const newMethods = (updated as Database["public"]["Enums"]["payment_method_enum"][]) || [];
        return (
          newMethods.length !== currentMethods.length ||
          !newMethods.every((method) => currentMethods.includes(method))
        );
      },
      message: "決済済みの参加者がいるため、決済方法は変更できません",
    },
  ];

  switch (operation) {
    case "update":
      return updateRules;
    case "delete":
      return deleteRules;
    case "payment_change":
      return paymentChangeRules;
    case "capacity_change":
      return updateRules.filter((rule) => rule.field === "capacity");
    default:
      return commonRules;
  }
}

/**
 * 参加者がいる場合のイベント編集制限をチェック（既存API互換）
 */
/**
 * @deprecated V2ロジック（checkEditRestrictionsV2）へ移行しました。新規コードでは使用しないでください。
 */
export function checkEditRestrictions(
  existingEvent: EventWithAttendances,
  newData: Partial<EventRow>
): EditRestrictionViolation[] {
  const attendeeCount = existingEvent.attendances?.length || 0;

  return checkEventRestrictions(existingEvent, newData, {
    operation: "update",
    attendeeCount,
  });
}

/**
 * イベント削除制限をチェック
 */
export function checkDeleteRestrictions(
  existingEvent: EventWithAttendances
): EditRestrictionViolation[] {
  const attendeeCount = existingEvent.attendances?.length || 0;

  return checkEventRestrictions(
    existingEvent,
    {},
    {
      operation: "delete",
      attendeeCount,
    }
  );
}

/**
 * ===== V2: 編集可否ロジック（破壊的置換用） =====
 * - 基本項目（title/location/description/date/registration_deadline/payment_deadline）は常に編集可
 * - capacity: 参加者数未満には減らせない（null は常に可）
 * - 金銭系（fee/payment_methods）: Stripe 決済完了者が1名以上いる場合のみ変更不可
 */

/**
 * V2用 ルール定義
 */
export function getRestrictionRulesV2(
  operation: RestrictionContext["operation"]
): RestrictionRule[] {
  const capacityRule: RestrictionRule = {
    field: "capacity",
    check: (_existing, updated, context) => {
      const newCapacity = updated as number | null;
      if (newCapacity === null || newCapacity === undefined) return false; // nullは常に可
      // 参加者数未満への減少は禁止
      return newCapacity < (context.attendeeCount || 0);
    },
    message: (context) =>
      `定員は現在の参加者数（${context.attendeeCount}名）以上で設定してください`,
  };

  const feeRule: RestrictionRule = {
    field: "fee",
    check: (existing, updated, context) => {
      if (!context.hasActivePayments) return false;
      return updated !== undefined && updated !== existing;
    },
    message: "決済済みの参加者がいるため、参加費は変更できません",
  };

  const paymentMethodsRule: RestrictionRule = {
    field: "payment_methods",
    check: (existing, updated, context) => {
      if (!context.hasActivePayments) return false;
      const current = new Set(
        (existing as Database["public"]["Enums"]["payment_method_enum"][]) || []
      );
      const next = new Set((updated as Database["public"]["Enums"]["payment_method_enum"][]) || []);
      // 追加は許可、既存の解除は不可（current にあるものが next から消えていたら違反）
      for (const method of current) {
        if (!next.has(method)) return true;
      }
      return false;
    },
    message: "決済済みの参加者がいるため、既存の決済方法は解除できません",
  };

  switch (operation) {
    case "update":
      // 更新では capacity + 金銭系のみを制限
      return [capacityRule, feeRule, paymentMethodsRule];
    case "payment_change":
      return [feeRule, paymentMethodsRule];
    case "capacity_change":
      return [capacityRule];
    default:
      return [];
  }
}

/**
 * V2: 編集制限チェック
 */
export function checkEditRestrictionsV2(
  existingEvent: EventWithAttendances,
  newData: Partial<EventRow>,
  params: { attendeeCount: number; hasActivePayments: boolean }
): EditRestrictionViolation[] {
  const context: RestrictionContext = {
    operation: "update",
    attendeeCount: params.attendeeCount,
    hasActivePayments: params.hasActivePayments,
  };

  const violations: EditRestrictionViolation[] = [];
  const rules = getRestrictionRulesV2(context.operation);

  for (const rule of rules) {
    const existingValue = getFieldValue(existingEvent, rule.field);
    const newValue = getFieldValue(newData, rule.field);
    const shouldCheck = newValue !== undefined; // 指定されたフィールドのみチェック
    if (shouldCheck && rule.check(existingValue, newValue, context)) {
      violations.push({
        field: rule.field,
        message: typeof rule.message === "function" ? rule.message(context) : rule.message,
      });
    }
  }

  return violations;
}
