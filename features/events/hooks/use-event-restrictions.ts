"use client";

import { useCallback } from "react";

import type { EventFormData } from "@core/types/models";

export type RestrictionType = "structural" | "conditional" | "advisory";

export interface RestrictionInfo {
  type: RestrictionType;
  reason: string;
  isActive: boolean;
}

// 制限レベルの分類:
// - structural: 絶対変更不可（決済済み時の料金・決済方法）
// - conditional: 条件下で変更不可（定員の参加者数未満への減少）
// - advisory: 変更可能だが影響あり（参加者への通知推奨）

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
  // 編集制限チェック関数をメモ化（制限レベル分類対応）
  const isFieldRestricted = useCallback(
    (field: string, formData?: EventFormData): boolean => {
      // 構造的制限：絶対変更不可
      if (field === "fee" || field === "payment_methods") {
        return hasStripePaid;
      }

      // 条件的制限：条件下で変更不可
      if (field === "capacity" && formData?.capacity) {
        const newCapacity = Number(formData.capacity);
        if (Number.isFinite(newCapacity) && newCapacity > 0) {
          return newCapacity < attendeeCount;
        }
      }

      return false;
    },
    [hasStripePaid, attendeeCount]
  );

  // 制限タイプを取得する関数
  const getFieldRestrictionType = useCallback((field: string): RestrictionType | null => {
    if (field === "fee" || field === "payment_methods") {
      return "structural";
    }
    if (field === "capacity") {
      return "conditional";
    }
    return null;
  }, []);

  // 制限情報を取得する関数
  const getFieldRestrictionInfo = useCallback(
    (field: string, formData?: EventFormData): RestrictionInfo | null => {
      const restrictionType = getFieldRestrictionType(field);
      if (!restrictionType) return null;

      const isActive = isFieldRestricted(field, formData);
      let reason = "";

      if (field === "fee" && hasStripePaid) {
        reason = "決済済み参加者がいるため、参加費は変更できません";
      } else if (field === "payment_methods" && hasStripePaid) {
        reason = "決済済み参加者がいるため、決済方法は変更できません";
      } else if (field === "capacity" && hasAttendees) {
        reason = `現在${attendeeCount}名の参加者がいるため、定員を${attendeeCount}名未満には設定できません`;
      }

      return {
        type: restrictionType,
        reason,
        isActive,
      };
    },
    [getFieldRestrictionType, isFieldRestricted, hasStripePaid, hasAttendees, attendeeCount]
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
      const restrictedFields: string[] = [];

      // 定員制限：現在の参加者数未満に減らそうとしている場合
      if (isFieldRestricted("capacity", formData)) {
        restrictedFields.push("capacity");
      }

      // 金銭系制限：Stripe決済済み参加者がいる場合
      if (hasStripePaid) {
        const moneyRelated = ["fee", "payment_methods"] as const;
        restrictedFields.push(
          ...moneyRelated.filter((field) => isFieldRestricted(field, formData))
        );
      }

      return restrictedFields;
    },
    [hasStripePaid, isFieldRestricted]
  );

  // 制限理由の取得
  const getRestrictionReason = useCallback(
    (field: string): string => {
      const reasons: Record<string, string> = {
        capacity: `現在の参加者数（${attendeeCount}名）以上で設定してください`,
        fee: "決済済みの参加者がいるため、参加費の変更はできません",
        payment_methods: "決済済みの参加者がいるため、決済方法の変更はできません",
      };

      if (reasons[field]) {
        return reasons[field];
      }

      // フィールド固有の理由がない場合のデフォルトメッセージ
      if (field === "capacity") {
        return `定員は現在の参加者数（${attendeeCount}名）以上で設定してください`;
      }

      if (hasStripePaid) {
        return `決済済みの参加者がいるため、${getFieldDisplayName(field)}の変更は制限されています`;
      }

      return "";
    },
    [hasStripePaid, attendeeCount, getFieldDisplayName]
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
    getFieldRestrictionType,
    getFieldRestrictionInfo,
  };
}
