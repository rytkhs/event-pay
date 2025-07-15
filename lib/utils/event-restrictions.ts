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
 * 参加者がいる場合のイベント編集制限をチェック
 */
export function checkEditRestrictions(
  existingEvent: EventWithAttendances,
  newData: Partial<EventRow>
): EditRestrictionViolation[] {
  const violations: EditRestrictionViolation[] = [];
  const hasAttendees = existingEvent.attendances && existingEvent.attendances.length > 0;

  if (!hasAttendees) {
    return violations; // 参加者がいない場合は制限なし
  }

  // タイトル変更チェック
  if (newData.title && newData.title !== existingEvent.title) {
    violations.push({
      field: "title",
      message: "参加者がいるため、タイトルは変更できません",
    });
  }

  // 日時変更チェック
  if (newData.date && newData.date !== existingEvent.date) {
    violations.push({
      field: "date",
      message: "参加者がいるため、開催日時は変更できません",
    });
  }

  // 参加費変更チェック
  if (newData.fee !== undefined && newData.fee !== existingEvent.fee) {
    violations.push({
      field: "fee",
      message: "参加者がいるため、参加費は変更できません",
    });
  }

  // 定員変更チェック（減少のみ禁止）
  if (newData.capacity !== undefined) {
    const currentCapacity = existingEvent.capacity || 999999;
    if (newData.capacity !== null && newData.capacity < currentCapacity) {
      violations.push({
        field: "capacity",
        message: "参加者がいるため、定員を減らすことはできません",
      });
    }
  }

  // 決済方法変更チェック
  if (newData.payment_methods) {
    const currentMethods = existingEvent.payment_methods || [];
    const newMethods = newData.payment_methods;

    // 配列の比較（順序を考慮しない）
    const hasChanged =
      newMethods.length !== currentMethods.length ||
      !newMethods.every((method) => currentMethods.includes(method));

    if (hasChanged) {
      violations.push({
        field: "payment_methods",
        message: "参加者がいるため、決済方法は変更できません",
      });
    }
  }

  return violations;
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
