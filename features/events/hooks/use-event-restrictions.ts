"use client";

import { useCallback } from "react";

import type { EventFormData } from "@core/types/models";
// import { parseCapacity } from "@core/utils/number-parsers";

interface UseEventRestrictionsProps {
  hasAttendees: boolean;
  attendeeCount: number;
  hasStripePaid: boolean;
}

export function useEventRestrictions({
  hasAttendees,
  attendeeCount,
  hasStripePaid,
}: UseEventRestrictionsProps) {
  // 編集制限チェック関数をメモ化（型安全な数値比較）
  const isFieldRestricted = useCallback(
    (field: string, _formData?: EventFormData): boolean => {
      // V2: 基本項目は常に編集可。
      // 金銭系のみ「Stripe決済済みの参加者がいる場合」にロック。
      if (!hasStripePaid) return false;
      return field === "fee" || field === "payment_methods";
    },
    [hasStripePaid]
  );

  // フィールド表示名の取得をメモ化
  const getFieldDisplayName = useCallback((field: string): string => {
    const displayNames: Record<string, string> = {
      title: "タイトル",
      description: "説明",
      location: "場所",
      date: "開催日時",
      fee: "参加費",
      capacity: "定員",
      payment_methods: "決済方法",
      registration_deadline: "参加申込締切",
      payment_deadline: "オンライン決済締切",
    };
    return displayNames[field] || field;
  }, []);

  // 制限されているフィールドの一覧を取得
  const getRestrictedFields = useCallback(
    (formData?: EventFormData): string[] => {
      // V2: ロックは参加者の有無ではなく「決済済み参加者の有無」に依存
      if (!hasStripePaid) return [];

      // 実際にロック対象となるのは金銭系のみ
      const moneyRelated = ["fee", "payment_methods"] as const;
      return moneyRelated.filter((field) => isFieldRestricted(field, formData));
    },
    [hasStripePaid, isFieldRestricted]
  );

  // 制限理由の取得
  const getRestrictionReason = useCallback(
    (field: string): string => {
      if (!hasStripePaid) return "";

      const reasons: Record<string, string> = {
        fee: "決済済みの参加者がいるため、参加費の変更はできません",
        payment_methods: "決済済みの参加者がいるため、決済方法の変更はできません",
      };

      return (
        reasons[field] ||
        `決済済みの参加者がいるため、${getFieldDisplayName(field)}の変更は制限されています`
      );
    },
    [hasStripePaid, getFieldDisplayName]
  );

  // フィールドが編集可能かどうかの判定
  const isFieldEditable = useCallback(
    (field: string, formData?: EventFormData): boolean => {
      return !isFieldRestricted(field, formData);
    },
    [isFieldRestricted]
  );

  // 制限されているフィールドの表示名一覧を取得
  const getRestrictedFieldNames = useCallback(
    (formData?: EventFormData): string[] => {
      const restrictedFields = getRestrictedFields(formData);
      return restrictedFields.map((field) => getFieldDisplayName(field));
    },
    [getRestrictedFields, getFieldDisplayName]
  );

  return {
    hasAttendees,
    attendeeCount,
    hasStripePaid,
    isFieldRestricted,
    isFieldEditable,
    getFieldDisplayName,
    getRestrictedFields,
    getRestrictedFieldNames,
    getRestrictionReason,
  };
}
