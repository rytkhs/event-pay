"use client";

import { useCallback } from "react";
import { parseCapacity } from "@core/utils/number-parsers";
import type { EventFormData } from "@core/types/models";

interface UseEventRestrictionsProps {
  hasAttendees: boolean;
  attendeeCount: number;
}

export function useEventRestrictions({ hasAttendees, attendeeCount }: UseEventRestrictionsProps) {
  // 編集制限チェック関数をメモ化（型安全な数値比較）
  const isFieldRestricted = useCallback(
    (field: string, formData?: EventFormData): boolean => {
      if (!hasAttendees) return false;

      // 参加者がいる場合の制限項目（EditRestrictionsNoticeと統一）
      const restrictedFields = ["title", "fee", "payment_methods"];

      if (field === "capacity" && formData) {
        // 定員は現在の参加者数未満にできない（満席状態を防ぐため）
        // 空文字列の場合は制限なし（未設定）として扱う
        const newCapacity = parseCapacity(formData.capacity);
        if (newCapacity === null) {
          return false; // 制限なし（null）の場合は制限なし
        }
        // 参加者数以上は許可（同値も含む）
        return newCapacity < attendeeCount;
      }

      return restrictedFields.includes(field);
    },
    [hasAttendees, attendeeCount]
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
      payment_deadline: "支払い締切",
    };
    return displayNames[field] || field;
  }, []);

  // 制限されているフィールドの一覧を取得
  const getRestrictedFields = useCallback(
    (formData?: EventFormData): string[] => {
      if (!hasAttendees) return [];

      const allFields = [
        "title",
        "description",
        "location",
        "date",
        "fee",
        "capacity",
        "payment_methods",
        "registration_deadline",
        "payment_deadline",
      ];

      return allFields.filter((field) => isFieldRestricted(field, formData));
    },
    [hasAttendees, isFieldRestricted]
  );

  // 制限理由の取得
  const getRestrictionReason = useCallback(
    (field: string): string => {
      if (!hasAttendees) return "";

      const reasons: Record<string, string> = {
        title: "参加者がいるため、タイトルの変更はできません",
        fee: "参加者がいるため、参加費の変更はできません",
        payment_methods: "参加者がいるため、決済方法の変更はできません",
        capacity: `定員は現在の参加者数（${attendeeCount}名）以上で設定してください`,
      };

      return (
        reasons[field] || `参加者がいるため、${getFieldDisplayName(field)}の変更は制限されています`
      );
    },
    [hasAttendees, attendeeCount, getFieldDisplayName]
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
    isFieldRestricted,
    isFieldEditable,
    getFieldDisplayName,
    getRestrictedFields,
    getRestrictedFieldNames,
    getRestrictionReason,
  };
}
