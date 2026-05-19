"use client";

import { useCallback, useMemo } from "react";

import { PAYMENT_METHOD_LABELS } from "@core/constants/status-labels";
import type { Event } from "@core/types/event";
import type { PaymentMethod } from "@core/types/statuses";
import { formatUtcToDatetimeLocal } from "@core/utils/timezone";
import type { EventFormData } from "@core/validation/event";

import type { ChangeItem } from "@/components/ui/change-confirmation-dialog";

interface UseEventChangesProps {
  event: Event;
  formData: EventFormData;
}

const EVENT_CHANGE_FIELD_LABELS: Record<string, string> = {
  title: "イベント名",
  description: "説明・備考",
  location: "場所",
  date: "開催日時",
  fee: "参加費",
  capacity: "定員",
  show_participant_count: "参加人数の表示",
  show_capacity: "定員の表示",
  payment_methods: "決済方法",
  registration_deadline: "出欠回答期限",
  payment_deadline: "オンライン支払い期限",
  allow_payment_after_deadline: "締切後もオンライン支払いを許可",
  grace_period_days: "猶予期間",
};

function getEventChangeFieldLabel(field: string): string {
  return EVENT_CHANGE_FIELD_LABELS[field] ?? field;
}

function isPaymentMethod(value: string): value is PaymentMethod {
  return Object.prototype.hasOwnProperty.call(PAYMENT_METHOD_LABELS, value);
}

function formatPaymentMethods(value: unknown): string {
  const methods = Array.isArray(value) ? value : [];
  if (methods.length === 0) return "選択なし";

  return methods
    .map((method) => {
      const methodString = String(method);
      return isPaymentMethod(methodString) ? PAYMENT_METHOD_LABELS[methodString] : methodString;
    })
    .join(" / ");
}

function formatNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value || 0);
  if (value == null) return 0;
  return Number(value);
}

function formatDatetimeLocalForDisplay(value: unknown): string {
  const dateTime = typeof value === "string" ? value : "";
  if (!dateTime) return "未設定";

  const match = dateTime.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return dateTime;

  const [, year, month, day, hour, minute] = match;
  return `${year}年${month}月${day}日 ${hour}:${minute}`;
}

function formatEventChangeValue(field: string, value: unknown): string {
  switch (field) {
    case "payment_methods":
      return formatPaymentMethods(value);

    case "date":
    case "registration_deadline":
    case "payment_deadline":
      return formatDatetimeLocalForDisplay(value);

    case "fee": {
      const amount = formatNumber(value);
      return amount === 0 ? "無料" : `${amount.toLocaleString("ja-JP")}円`;
    }

    case "capacity": {
      if (value === "" || value == null) return "未設定";
      return `${formatNumber(value).toLocaleString("ja-JP")}人`;
    }

    case "grace_period_days": {
      const days = formatNumber(value);
      return days === 0 ? "なし" : `${days.toLocaleString("ja-JP")}日`;
    }

    case "allow_payment_after_deadline":
      return Boolean(value) ? "許可する" : "許可しない";

    case "show_capacity":
    case "show_participant_count":
      return Boolean(value) ? "表示する" : "表示しない";

    default: {
      const text = (value ?? "").toString();
      return text || "未設定";
    }
  }
}

export function useEventChanges({ event, formData }: UseEventChangesProps) {
  // 副次的クリアの検出機能
  const detectSecondaryChanges = useCallback((): ChangeItem[] => {
    const secondaryChanges: ChangeItem[] = [];

    // 参加費が0円になった場合の副次的クリアを検出
    const currentFee =
      typeof formData.fee === "string" ? Number(formData.fee || 0) : formData.fee || 0;
    const originalFee = event.fee ?? 0;

    if (currentFee === 0 && originalFee > 0) {
      // 決済方法がクリアされる場合
      const originalPaymentMethods = event.payment_methods || [];
      const currentPaymentMethods = formData.payment_methods || [];

      if (originalPaymentMethods.length > 0 && currentPaymentMethods.length === 0) {
        secondaryChanges.push({
          field: "payment_methods",
          fieldName: getEventChangeFieldLabel("payment_methods"),
          oldValue: formatEventChangeValue("payment_methods", originalPaymentMethods),
          newValue: "（無料化により自動クリア）",
        });
      }

      // オンライン支払い期限がクリアされる場合
      const originalPaymentDeadline = event.payment_deadline;
      const currentPaymentDeadline = formData.payment_deadline;

      if (
        originalPaymentDeadline &&
        (!currentPaymentDeadline || currentPaymentDeadline.trim() === "")
      ) {
        secondaryChanges.push({
          field: "payment_deadline",
          fieldName: getEventChangeFieldLabel("payment_deadline"),
          oldValue: formatEventChangeValue(
            "payment_deadline",
            formatUtcToDatetimeLocal(originalPaymentDeadline)
          ),
          newValue: "（無料化により自動クリア）",
        });
      }

      // 締切後決済許可がクリアされる場合
      const originalAllowAfter = event.allow_payment_after_deadline;
      const currentAllowAfter = formData.allow_payment_after_deadline;

      if (originalAllowAfter && !currentAllowAfter) {
        secondaryChanges.push({
          field: "allow_payment_after_deadline",
          fieldName: getEventChangeFieldLabel("allow_payment_after_deadline"),
          oldValue: formatEventChangeValue("allow_payment_after_deadline", originalAllowAfter),
          newValue: "（無料化により自動クリア）",
        });
      }

      // 猶予期間がクリアされる場合
      const originalGrace = event.grace_period_days ?? 0;
      const currentGrace =
        typeof formData.grace_period_days === "string"
          ? Number(formData.grace_period_days || 0)
          : formData.grace_period_days || 0;

      if (originalGrace > 0 && currentGrace === 0) {
        secondaryChanges.push({
          field: "grace_period_days",
          fieldName: getEventChangeFieldLabel("grace_period_days"),
          oldValue: formatEventChangeValue("grace_period_days", originalGrace),
          newValue: "（無料化により自動クリア）",
        });
      }
    }

    // Stripe選択解除時の副次的クリアを検出
    const originalPaymentMethods = event.payment_methods || [];
    const currentPaymentMethods = formData.payment_methods || [];
    const hadStripe = originalPaymentMethods.includes("stripe");
    const hasStripe = currentPaymentMethods.includes("stripe");

    if (hadStripe && !hasStripe) {
      // オンライン支払い期限がクリアされる場合
      const originalPaymentDeadline = event.payment_deadline;
      const currentPaymentDeadline = formData.payment_deadline;

      if (
        originalPaymentDeadline &&
        (!currentPaymentDeadline || currentPaymentDeadline.trim() === "")
      ) {
        secondaryChanges.push({
          field: "payment_deadline",
          fieldName: getEventChangeFieldLabel("payment_deadline"),
          oldValue: formatEventChangeValue(
            "payment_deadline",
            formatUtcToDatetimeLocal(originalPaymentDeadline)
          ),
          newValue: "（オンライン支払い選択解除により自動クリア）",
        });
      }

      // 締切後決済許可がクリアされる場合
      const originalAllowAfter = event.allow_payment_after_deadline;
      const currentAllowAfter = formData.allow_payment_after_deadline;

      if (originalAllowAfter && !currentAllowAfter) {
        secondaryChanges.push({
          field: "allow_payment_after_deadline",
          fieldName: getEventChangeFieldLabel("allow_payment_after_deadline"),
          oldValue: formatEventChangeValue("allow_payment_after_deadline", originalAllowAfter),
          newValue: "（オンライン支払い選択解除により自動クリア）",
        });
      }

      // 猶予期間がクリアされる場合
      const originalGrace = event.grace_period_days ?? 0;
      const currentGrace =
        typeof formData.grace_period_days === "string"
          ? Number(formData.grace_period_days || 0)
          : formData.grace_period_days || 0;

      if (originalGrace > 0 && currentGrace === 0) {
        secondaryChanges.push({
          field: "grace_period_days",
          fieldName: getEventChangeFieldLabel("grace_period_days"),
          oldValue: formatEventChangeValue("grace_period_days", originalGrace),
          newValue: "（オンライン支払い選択解除により自動クリア）",
        });
      }
    }

    return secondaryChanges;
  }, [event, formData]);

  // 変更検出機能（型安全・サーバーサイドと整合した比較ロジック）
  const detectChanges = useCallback((): ChangeItem[] => {
    const changes: ChangeItem[] = [];

    // 型安全なフィールド比較関数
    const isFieldChanged = (field: string, oldValue: unknown, newValue: unknown): boolean => {
      switch (field) {
        case "fee":
          // 数値として比較（サーバーサイドと統一）
          const oldFee = typeof oldValue === "number" ? oldValue : Number(oldValue || 0);
          const newFee = typeof newValue === "string" ? Number(newValue || 0) : newValue || 0;
          return oldFee !== newFee;

        case "capacity":
          // 数値として比較（空文字/null は null として扱う）
          const oldCapacity = oldValue === "" || oldValue == null ? null : Number(oldValue);
          const newCapacity = newValue === "" || newValue == null ? null : Number(newValue);
          return oldCapacity !== newCapacity;

        case "payment_methods":
          // 配列として比較（順序を無視したSet比較、サーバーサイドと統一）
          const oldMethods = Array.isArray(oldValue) ? oldValue : [];
          const newMethods = Array.isArray(newValue) ? newValue : [];
          const oldSet = new Set(oldMethods);
          const newSet = new Set(newMethods);
          return (
            oldSet.size !== newSet.size || !Array.from(oldSet).every((method) => newSet.has(method))
          );

        case "allow_payment_after_deadline":
        case "show_capacity":
        case "show_participant_count":
          // boolean として比較
          const oldBool = Boolean(oldValue);
          const newBool = Boolean(newValue);
          return oldBool !== newBool;

        case "grace_period_days":
          // 数値として比較
          const oldGrace = typeof oldValue === "number" ? oldValue : Number(oldValue || 0);
          const newGrace = typeof newValue === "string" ? Number(newValue || 0) : newValue || 0;
          return oldGrace !== newGrace;

        default:
          // 文字列として比較（nullish は空文字として扱う）
          const oldStr = (oldValue ?? "").toString();
          const newStr = (newValue ?? "").toString();
          return oldStr !== newStr;
      }
    };

    // 各フィールドの変更をチェック
    const fieldChecks = [
      {
        field: "title",
        oldValue: event.title || "",
        newValue: formData.title,
        fieldName: getEventChangeFieldLabel("title"),
      },
      {
        field: "description",
        oldValue: event.description || "",
        newValue: formData.description,
        fieldName: getEventChangeFieldLabel("description"),
      },
      {
        field: "location",
        oldValue: event.location || "",
        newValue: formData.location,
        fieldName: getEventChangeFieldLabel("location"),
      },
      {
        field: "date",
        oldValue: formatUtcToDatetimeLocal(event.date),
        newValue: formData.date,
        fieldName: getEventChangeFieldLabel("date"),
      },
      {
        field: "fee",
        oldValue: event.fee ?? 0,
        newValue: formData.fee || "0",
        fieldName: getEventChangeFieldLabel("fee"),
      },
      {
        field: "capacity",
        oldValue: event.capacity,
        newValue: formData.capacity || "",
        fieldName: getEventChangeFieldLabel("capacity"),
      },
      {
        field: "show_participant_count",
        oldValue: event.show_participant_count ?? true,
        newValue: formData.show_participant_count ?? true,
        fieldName: getEventChangeFieldLabel("show_participant_count"),
      },
      {
        field: "show_capacity",
        oldValue: event.show_capacity,
        newValue: formData.show_capacity,
        fieldName: getEventChangeFieldLabel("show_capacity"),
      },
      {
        field: "payment_methods",
        oldValue: event.payment_methods || [],
        newValue: formData.payment_methods || [],
        fieldName: getEventChangeFieldLabel("payment_methods"),
      },
      {
        field: "registration_deadline",
        oldValue: formatUtcToDatetimeLocal(event.registration_deadline || ""),
        newValue: formData.registration_deadline || "",
        fieldName: getEventChangeFieldLabel("registration_deadline"),
      },
      {
        field: "payment_deadline",
        oldValue: formatUtcToDatetimeLocal(event.payment_deadline || ""),
        newValue: formData.payment_deadline || "",
        fieldName: getEventChangeFieldLabel("payment_deadline"),
      },
      {
        field: "allow_payment_after_deadline",
        oldValue: event.allow_payment_after_deadline ?? false,
        newValue: formData.allow_payment_after_deadline ?? false,
        fieldName: getEventChangeFieldLabel("allow_payment_after_deadline"),
      },
      {
        field: "grace_period_days",
        oldValue: event.grace_period_days ?? 0,
        newValue: formData.grace_period_days ?? "0",
        fieldName: getEventChangeFieldLabel("grace_period_days"),
      },
    ];

    fieldChecks.forEach(({ field, oldValue, newValue, fieldName }) => {
      if (isFieldChanged(field, oldValue, newValue)) {
        changes.push({
          field,
          fieldName,
          oldValue: formatEventChangeValue(field, oldValue),
          newValue: formatEventChangeValue(field, newValue),
        });
      }
    });

    // 副次的変更を考慮して重複を統合（同一フィールドは1件に集約。副次的変更を優先）
    const secondaryChanges = detectSecondaryChanges();
    const mergedChangesByField = new Map<string, ChangeItem>();

    // まず通常変更を格納
    for (const change of changes) {
      if (!mergedChangesByField.has(change.field)) {
        mergedChangesByField.set(change.field, change);
      }
    }

    // 副次的変更がある場合は同一フィールドを上書き（説明性の高い表示を優先）
    for (const secondary of secondaryChanges) {
      mergedChangesByField.set(secondary.field, secondary);
    }

    return Array.from(mergedChangesByField.values());
  }, [event, formData, detectSecondaryChanges]);

  // 変更があるかどうかをメモ化
  const hasChanges = useMemo(() => {
    return detectChanges().length > 0;
  }, [detectChanges]);

  // 特定フィールドに変更があるかチェック
  const hasFieldChanged = useCallback(
    (fieldName: string): boolean => {
      const changes = detectChanges();
      return changes.some((change) => change.field === fieldName);
    },
    [detectChanges]
  );

  // 変更されたフィールド名の一覧を取得
  const getChangedFieldNames = useCallback((): string[] => {
    const changes = detectChanges();
    return changes.map((change) => change.fieldName);
  }, [detectChanges]);

  // 変更されたフィールドの数を取得
  const getChangeCount = useCallback((): number => {
    return detectChanges().length;
  }, [detectChanges]);

  // 変更内容のサマリーを取得
  const getChangeSummary = useCallback((): string => {
    const changes = detectChanges();
    if (changes.length === 0) return "変更はありません";

    const fieldNames = changes.map((change) => change.fieldName);
    if (fieldNames.length === 1) {
      return `${fieldNames[0]}を変更しました`;
    }

    return `${fieldNames.join(", ")}を変更しました（${fieldNames.length}項目）`;
  }, [detectChanges]);

  // 特定の変更タイプをフィルタリング
  const getChangesByType = useCallback(
    (fieldType: "basic" | "datetime" | "payment"): ChangeItem[] => {
      const changes = detectChanges();

      const fieldTypes = {
        basic: ["title", "description", "location"],
        datetime: ["date", "registration_deadline", "payment_deadline"],
        payment: [
          "fee",
          "payment_methods",
          "capacity",
          "show_capacity",
          "show_participant_count",
          "allow_payment_after_deadline",
          "grace_period_days",
        ],
      };

      return changes.filter((change) => fieldTypes[fieldType].includes(change.field));
    },
    [detectChanges]
  );

  // 重要な変更があるかチェック（参加者に影響する変更）
  const hasCriticalChanges = useCallback((): boolean => {
    const criticalFields = ["title", "date", "fee", "location", "payment_methods"];
    const changes = detectChanges();
    return changes.some((change) => criticalFields.includes(change.field));
  }, [detectChanges]);

  // 変更を元に戻すためのデータを生成
  const getRevertData = useCallback((): Partial<EventFormData> => {
    const revertData: Partial<EventFormData> = {};
    const changes = detectChanges();

    changes.forEach((change) => {
      switch (change.field) {
        case "payment_methods":
          revertData.payment_methods = event.payment_methods || [];
          break;
        case "fee":
          revertData.fee = event.fee?.toString() || "0";
          break;
        case "capacity":
          revertData.capacity = event.capacity?.toString() || "";
          break;
        case "show_participant_count":
          revertData.show_participant_count = event.show_participant_count ?? true;
          break;
        case "show_capacity":
          revertData.show_capacity = event.show_capacity;
          break;
        case "date":
          revertData.date = formatUtcToDatetimeLocal(event.date);
          break;
        case "registration_deadline":
          revertData.registration_deadline = formatUtcToDatetimeLocal(
            event.registration_deadline || ""
          );
          break;
        case "payment_deadline":
          revertData.payment_deadline = formatUtcToDatetimeLocal(event.payment_deadline || "");
          break;
        case "title":
          revertData.title = event.title || "";
          break;
        case "description":
          revertData.description = event.description || "";
          break;
        case "location":
          revertData.location = event.location || "";
          break;
      }
    });

    return revertData;
  }, [event, detectChanges]);

  return {
    hasChanges,
    detectChanges,
    hasFieldChanged,
    getChangedFieldNames,
    getChangeCount,
    getChangeSummary,
    getChangesByType,
    hasCriticalChanges,
    getRevertData,
  };
}
