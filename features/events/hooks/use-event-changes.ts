"use client";

import { useCallback, useMemo } from "react";

import type { Event } from "@core/types/models";
import { formatUtcToDatetimeLocal } from "@core/utils/timezone";
import type { EventFormData } from "@core/validation/event";

import { ChangeItem } from "@/components/ui/change-confirmation-dialog";

interface UseEventChangesProps {
  event: Event;
  formData: EventFormData;
  hasValidationErrors?: boolean;
  // フィールドが編集可能かを判定する関数（未指定時は全て編集可能とみなす）
  isFieldEditable?: (field: string) => boolean;
}

export function useEventChanges({
  event,
  formData,
  hasValidationErrors = false,
  isFieldEditable,
}: UseEventChangesProps) {
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
          fieldName: "決済方法",
          oldValue: originalPaymentMethods.join(", "),
          newValue: "（無料化により自動クリア）",
        });
      }

      // 決済締切がクリアされる場合
      const originalPaymentDeadline = event.payment_deadline;
      const currentPaymentDeadline = formData.payment_deadline;

      if (
        originalPaymentDeadline &&
        (!currentPaymentDeadline || currentPaymentDeadline.trim() === "")
      ) {
        secondaryChanges.push({
          field: "payment_deadline",
          fieldName: "決済締切",
          oldValue: formatUtcToDatetimeLocal(originalPaymentDeadline),
          newValue: "（無料化により自動クリア）",
        });
      }

      // 締切後決済許可がクリアされる場合
      const originalAllowAfter = event.allow_payment_after_deadline;
      const currentAllowAfter = formData.allow_payment_after_deadline;

      if (originalAllowAfter && !currentAllowAfter) {
        secondaryChanges.push({
          field: "allow_payment_after_deadline",
          fieldName: "締切後決済許可",
          oldValue: "許可",
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
          fieldName: "猶予期間",
          oldValue: originalGrace.toString(),
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
      // 決済締切がクリアされる場合
      const originalPaymentDeadline = event.payment_deadline;
      const currentPaymentDeadline = formData.payment_deadline;

      if (
        originalPaymentDeadline &&
        (!currentPaymentDeadline || currentPaymentDeadline.trim() === "")
      ) {
        secondaryChanges.push({
          field: "payment_deadline",
          fieldName: "決済締切",
          oldValue: formatUtcToDatetimeLocal(originalPaymentDeadline),
          newValue: "（オンライン決済選択解除により自動クリア）",
        });
      }

      // 締切後決済許可がクリアされる場合
      const originalAllowAfter = event.allow_payment_after_deadline;
      const currentAllowAfter = formData.allow_payment_after_deadline;

      if (originalAllowAfter && !currentAllowAfter) {
        secondaryChanges.push({
          field: "allow_payment_after_deadline",
          fieldName: "締切後決済許可",
          oldValue: "許可",
          newValue: "（オンライン決済選択解除により自動クリア）",
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
          fieldName: "猶予期間",
          oldValue: originalGrace.toString(),
          newValue: "（オンライン決済選択解除により自動クリア）",
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
        fieldName: "イベント名",
      },
      {
        field: "description",
        oldValue: event.description || "",
        newValue: formData.description,
        fieldName: "説明",
      },
      {
        field: "location",
        oldValue: event.location || "",
        newValue: formData.location,
        fieldName: "場所",
      },
      {
        field: "date",
        oldValue: formatUtcToDatetimeLocal(event.date),
        newValue: formData.date,
        fieldName: "開催日時",
      },
      {
        field: "fee",
        oldValue: event.fee ?? 0,
        newValue: formData.fee || "0",
        fieldName: "参加費",
      },
      {
        field: "capacity",
        oldValue: event.capacity,
        newValue: formData.capacity || "",
        fieldName: "定員",
      },
      {
        field: "payment_methods",
        oldValue: event.payment_methods || [],
        newValue: formData.payment_methods || [],
        fieldName: "決済方法",
      },
      {
        field: "registration_deadline",
        oldValue: formatUtcToDatetimeLocal(event.registration_deadline || ""),
        newValue: formData.registration_deadline || "",
        fieldName: "参加申込締切",
      },
      {
        field: "payment_deadline",
        oldValue: formatUtcToDatetimeLocal(event.payment_deadline || ""),
        newValue: formData.payment_deadline || "",
        fieldName: "オンライン決済締切",
      },
      {
        field: "allow_payment_after_deadline",
        oldValue: event.allow_payment_after_deadline ?? false,
        newValue: formData.allow_payment_after_deadline ?? false,
        fieldName: "締切後もオンライン決済を許可",
      },
      {
        field: "grace_period_days",
        oldValue: event.grace_period_days ?? 0,
        newValue: formData.grace_period_days ?? "0",
        fieldName: "猶予（日）",
      },
    ];

    fieldChecks.forEach(({ field, oldValue, newValue, fieldName }) => {
      // 編集不可フィールドは検出対象から除外
      if (typeof isFieldEditable === "function" && !isFieldEditable(field)) {
        return;
      }
      if (isFieldChanged(field, oldValue, newValue)) {
        // 表示用の値を生成（統一された形式）
        let displayOldValue: string;
        let displayNewValue: string;

        if (field === "payment_methods") {
          displayOldValue = Array.isArray(oldValue) ? oldValue.join(", ") : "";
          displayNewValue = Array.isArray(newValue) ? newValue.join(", ") : "";
        } else if (field === "fee") {
          displayOldValue = (
            typeof oldValue === "number" ? oldValue : Number(oldValue || 0)
          ).toString();
          displayNewValue = (
            typeof newValue === "string" ? Number(newValue || 0) : newValue || 0
          ).toString();
        } else if (field === "capacity") {
          displayOldValue = oldValue === null ? "" : oldValue.toString();
          displayNewValue = newValue === "" || newValue == null ? "" : newValue.toString();
        } else if (field === "allow_payment_after_deadline") {
          displayOldValue = Boolean(oldValue) ? "許可" : "禁止";
          displayNewValue = Boolean(newValue) ? "許可" : "禁止";
        } else if (field === "grace_period_days") {
          displayOldValue = (
            typeof oldValue === "number" ? oldValue : Number(oldValue || 0)
          ).toString();
          displayNewValue = (
            typeof newValue === "string" ? Number(newValue || 0) : newValue || 0
          ).toString();
        } else {
          displayOldValue = (oldValue ?? "").toString();
          displayNewValue = (newValue ?? "").toString();
        }

        changes.push({
          field,
          fieldName,
          oldValue: displayOldValue,
          newValue: displayNewValue,
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
  }, [event, formData, isFieldEditable, detectSecondaryChanges]);

  // 変更があるかどうかをメモ化（バリデーションエラーがある場合は変更なし扱い）
  const hasChanges = useMemo(() => {
    if (hasValidationErrors) return false;
    return detectChanges().length > 0;
  }, [detectChanges, hasValidationErrors]);

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
