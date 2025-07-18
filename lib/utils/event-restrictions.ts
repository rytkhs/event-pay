import type { Database } from "@/types/database";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type AttendanceRow = Database["public"]["Tables"]["attendances"]["Row"];

interface EventWithAttendances extends EventRow {
  attendances: AttendanceRow[];
}

export interface EditRestrictionViolation {
  field: string;
  message: string;
}

/**
 * 制限チェックのコンテキスト情報
 */
export interface RestrictionContext {
  operation: "update" | "delete" | "payment_change" | "capacity_change";
  attendeeCount: number;
  hasPayments?: boolean;
  hasActivePayments?: boolean;
}

/**
 * 制限ルールの定義
 */
export interface RestrictionRule {
  field: string;
  check: (existingValue: any, newValue: any, context: RestrictionContext) => boolean;
  message: string | ((context: RestrictionContext) => string);
}

/**
 * 型安全なフィールド値取得ヘルパー
 */
function getFieldValue(obj: any, fieldName: string): any {
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
      return obj; // 削除操作用
    default:
      return undefined;
  }
}

/**
 * 汎用的なイベント制限チェック機能
 */
export function checkEventRestrictions(
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
function getRestrictionRules(operation: string): RestrictionRule[] {
  const commonRules: RestrictionRule[] = [
    {
      field: "title",
      check: (existing, updated) => existing !== updated,
      message: "参加者がいるため、タイトルは変更できません",
    },
    {
      field: "fee",
      check: (existing, updated) => existing !== updated,
      message: "参加者がいるため、参加費は変更できません",
    },
    {
      field: "payment_methods",
      check: (existing, updated) => {
        const currentMethods = existing || [];
        const newMethods = updated || [];
        return (
          newMethods.length !== currentMethods.length ||
          !newMethods.every((method: string) => currentMethods.includes(method))
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
        const currentCapacity = existing || 999999;
        return updated !== null && updated < currentCapacity && updated < context.attendeeCount;
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
        const currentMethods = existing || [];
        const newMethods = updated || [];
        return (
          newMethods.length !== currentMethods.length ||
          !newMethods.every((method: string) => currentMethods.includes(method))
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
 * 決済関連変更制限をチェック
 */
export function checkPaymentChangeRestrictions(
  existingEvent: EventWithAttendances,
  newData: Partial<EventRow>,
  hasActivePayments: boolean
): EditRestrictionViolation[] {
  const attendeeCount = existingEvent.attendances?.length || 0;

  return checkEventRestrictions(existingEvent, newData, {
    operation: "payment_change",
    attendeeCount,
    hasActivePayments,
  });
}

/**
 * 定員変更制限をチェック
 */
export function checkCapacityChangeRestrictions(
  existingEvent: EventWithAttendances,
  newCapacity: number
): EditRestrictionViolation[] {
  const attendeeCount = existingEvent.attendances?.length || 0;

  return checkEventRestrictions(
    existingEvent,
    { capacity: newCapacity },
    {
      operation: "capacity_change",
      attendeeCount,
    }
  );
}

/**
 * 参加者がいる場合に編集可能なフィールドのみを残す
 */
export function filterEditableFields(
  existingEvent: EventWithAttendances,
  newData: Partial<EventRow>
): Partial<EventRow> {
  const hasAttendees = existingEvent.attendances && existingEvent.attendances.length > 0;

  if (!hasAttendees) {
    return newData; // 参加者がいない場合は全て編集可能
  }

  // 参加者がいる場合に編集可能なフィールドのみ抽出
  const editableFields: Partial<EventRow> = {};

  // 編集可能項目
  if (newData.description !== undefined) {
    editableFields.description = newData.description;
  }

  if (newData.location !== undefined) {
    editableFields.location = newData.location;
  }

  // 開催日時も編集可能
  if (newData.date !== undefined) {
    editableFields.date = newData.date;
  }

  // 定員は増加のみ可能
  if (newData.capacity !== undefined) {
    const currentCapacity = existingEvent.capacity || 999999;
    if (newData.capacity !== null && newData.capacity >= currentCapacity) {
      editableFields.capacity = newData.capacity;
    }
  }

  // 締切日時は変更可能（ただし整合性チェックは必要）
  if (newData.registration_deadline !== undefined) {
    editableFields.registration_deadline = newData.registration_deadline;
  }

  if (newData.payment_deadline !== undefined) {
    editableFields.payment_deadline = newData.payment_deadline;
  }

  return editableFields;
}

/**
 * 編集制限のルール説明を取得
 */
export function getEditRestrictionRules(): {
  restrictedFields: string[];
  editableFields: string[];
  rules: string[];
} {
  return {
    restrictedFields: ["title", "date", "fee", "payment_methods", "capacity (減少のみ)"],
    editableFields: [
      "description",
      "location",
      "capacity (増加のみ)",
      "registration_deadline",
      "payment_deadline",
    ],
    rules: [
      "参加者がいる場合、基本情報の変更は制限されます",
      "説明と場所の詳細情報は追加・変更可能です",
      "定員は増加のみ可能です",
      "締切日時は変更可能ですが、整合性チェックが行われます",
    ],
  };
}
