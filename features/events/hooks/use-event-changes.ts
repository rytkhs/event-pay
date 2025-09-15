"use client";

import { useCallback, useMemo } from "react";

import type { Event, EventFormData } from "@core/types/models";
import { formatUtcToDatetimeLocal } from "@core/utils/timezone";

import { ChangeItem } from "@/components/ui/change-confirmation-dialog";

interface UseEventChangesProps {
  event: Event;
  formData: EventFormData;
  hasValidationErrors?: boolean;
}

export function useEventChanges({
  event,
  formData,
  hasValidationErrors = false,
}: UseEventChangesProps) {
  // 変更検出機能（型安全な日付比較）
  const detectChanges = useCallback((): ChangeItem[] => {
    const changes: ChangeItem[] = [];

    // 各フィールドの変更をチェック
    const fieldChecks = [
      {
        field: "title",
        oldValue: event.title || "",
        newValue: formData.title,
        fieldName: "タイトル",
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
        oldValue: event.fee?.toString() || "0",
        newValue: formData.fee || "0",
        fieldName: "参加費",
      },
      {
        field: "capacity",
        oldValue: event.capacity?.toString() || "",
        newValue: formData.capacity || "",
        fieldName: "定員",
      },
      {
        field: "payment_methods",
        oldValue: (event.payment_methods || []).join(", "),
        newValue: formData.payment_methods.join(", "),
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
        oldValue: ((event as any).allow_payment_after_deadline ?? false).toString(),
        newValue: ((formData as any).allow_payment_after_deadline ?? false).toString(),
        fieldName: "締切後もオンライン決済を許可",
      },
      {
        field: "grace_period_days",
        oldValue: (((event as any).grace_period_days ?? 0) as number).toString(),
        newValue: ((formData as any).grace_period_days ?? "0") as string,
        fieldName: "猶予（日）",
      },
    ];

    fieldChecks.forEach(({ field, oldValue, newValue, fieldName }) => {
      if (oldValue !== newValue) {
        changes.push({
          field,
          fieldName,
          oldValue,
          newValue,
        });
      }
    });

    return changes;
  }, [event, formData]);

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
