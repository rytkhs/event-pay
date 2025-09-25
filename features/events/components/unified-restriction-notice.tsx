"use client";

import { useMemo } from "react";

import { AlertTriangle, Ban, Info } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export interface RestrictionData {
  hasAttendees: boolean;
  attendeeCount: number;
  hasStripePaid: boolean;
}

export type RestrictionLevel = "structural" | "conditional" | "advisory";

export interface RestrictionItem {
  level: RestrictionLevel;
  field: string;
  fieldName: string;
  message: string;
  isActive: boolean;
}

interface UnifiedRestrictionNoticeProps {
  restrictions: RestrictionData;
  className?: string;
}

/**
 * 統合制限通知コンポーネント
 *
 * 制限を3つのレベルに分類して統一表示：
 * - 構造的制限: 絶対変更不可（決済済み時の料金・決済方法）
 * - 条件的制限: 条件下で変更不可（定員の参加者数未満への減少）
 * - 注意事項: 変更可能だが影響あり（参加者への通知推奨）
 */
export function UnifiedRestrictionNotice({
  restrictions,
  className = "",
}: UnifiedRestrictionNoticeProps) {
  const { hasAttendees, attendeeCount, hasStripePaid } = restrictions;

  const restrictionItems = useMemo((): RestrictionItem[] => {
    const items: RestrictionItem[] = [];

    // 構造的制限（絶対変更不可）
    if (hasStripePaid) {
      items.push({
        level: "structural",
        field: "fee",
        fieldName: "参加費",
        message: `決済済み参加者がいるため、参加費は変更できません`,
        isActive: true,
      });

      items.push({
        level: "structural",
        field: "payment_methods",
        fieldName: "決済方法",
        message: `決済済み参加者がいるため、決済方法は変更できません`,
        isActive: true,
      });
    }

    // 条件的制限（条件下で変更不可）
    if (hasAttendees) {
      items.push({
        level: "conditional",
        field: "capacity",
        fieldName: "定員",
        message: `現在${attendeeCount}名の参加者がいるため、定員を${attendeeCount}名未満には設定できません`,
        isActive: true,
      });
    }

    // 注意事項（変更可能だが影響あり）
    if (hasAttendees) {
      items.push({
        level: "advisory",
        field: "general",
        fieldName: "参加者への影響",
        message: `変更内容により参加者に影響が生じる場合があります。必要に応じて参加者へご連絡ください`,
        isActive: true,
      });
    }

    return items.filter((item) => item.isActive);
  }, [hasAttendees, attendeeCount, hasStripePaid]);

  // 制限がない場合は何も表示しない
  if (restrictionItems.length === 0) {
    return null;
  }

  // レベル別にグループ化
  const structuralItems = restrictionItems.filter((item) => item.level === "structural");
  const conditionalItems = restrictionItems.filter((item) => item.level === "conditional");
  const advisoryItems = restrictionItems.filter((item) => item.level === "advisory");

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 構造的制限（赤色・最も重要） */}
      {structuralItems.length > 0 && (
        <Alert variant="destructive">
          <Ban className="h-4 w-4" />
          <AlertTitle>編集制限項目</AlertTitle>
          <AlertDescription>
            <div className="space-y-1">
              {structuralItems.map((item, index) => (
                <p key={index} className="text-sm">
                  • {item.message}
                </p>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* 条件的制限（アンバー色・注意が必要） */}
      {conditionalItems.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>編集時の注意事項</AlertTitle>
          <AlertDescription>
            <div className="space-y-1">
              {conditionalItems.map((item, index) => (
                <p key={index} className="text-sm">
                  • {item.message}
                </p>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* 注意事項（ブルー色・情報提供） */}
      {advisoryItems.length > 0 && (
        <Alert variant="default" className="border-blue-200 bg-blue-50">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-blue-900">参加者への配慮</AlertTitle>
          <AlertDescription className="text-blue-800">
            <div className="space-y-1">
              {advisoryItems.map((item, index) => (
                <p key={index} className="text-sm">
                  • {item.message}
                </p>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

/**
 * フィールドが制限されているかを判定するヘルパー関数
 */
export function isFieldStructurallyRestricted(
  field: string,
  restrictions: RestrictionData
): boolean {
  const { hasStripePaid } = restrictions;

  if (field === "fee" || field === "payment_methods") {
    return hasStripePaid;
  }

  return false;
}

/**
 * フィールドが条件的に制限されているかを判定するヘルパー関数
 */
export function isFieldConditionallyRestricted(
  field: string,
  value: any,
  restrictions: RestrictionData
): boolean {
  const { hasAttendees, attendeeCount } = restrictions;

  if (field === "capacity" && hasAttendees && value) {
    const newCapacity = Number(value);
    if (Number.isFinite(newCapacity) && newCapacity > 0) {
      return newCapacity < attendeeCount;
    }
  }

  return false;
}
