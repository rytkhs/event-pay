"use client";

/**
 * 統一制限表示コンポーネント V2 - リアルタイム制限表示
 */

import React, { useMemo } from "react";

import { InfoIcon, AlertTriangleIcon, XCircleIcon } from "lucide-react";

import {
  RestrictionContext,
  FormDataSnapshot,
  RestrictionLevel,
  ActiveRestriction,
} from "@core/domain/event-edit-restrictions";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

import { useUnifiedRestrictions } from "../hooks/use-unified-restrictions";

// =============================================================================
// Component Props - コンポーネント Props
// =============================================================================

export interface UnifiedRestrictionNoticeV2Props {
  /** 制限コンテキスト */
  restrictions: RestrictionContext;
  /** フォームデータ（動的制限判定用） */
  formData: FormDataSnapshot;
  /** 表示する制限レベル */
  showLevels?: RestrictionLevel[];
  /** コンパクトモード（簡略表示） */
  compact?: boolean;
  /** カスタムクラス名 */
  className?: string;
  /** デバッグモード */
  debug?: boolean;
}

// =============================================================================
// Internal Components - 内部コンポーネント
// =============================================================================

/**
 * 制限レベル別のアイコンとスタイルを取得
 */
function getRestrictionLevelProps(level: RestrictionLevel) {
  switch (level) {
    case "structural":
      return {
        icon: XCircleIcon,
        variant: "destructive" as const,
        badgeVariant: "destructive" as const,
        title: "編集制限項目",
        description: "以下の項目は編集できません",
      };
    case "conditional":
      return {
        icon: AlertTriangleIcon,
        variant: "default" as const,
        badgeVariant: "secondary" as const,
        title: "条件付き制限",
        description: "現在の設定では編集に制限があります",
      };
    case "advisory":
      return {
        icon: InfoIcon,
        variant: "default" as const,
        badgeVariant: "outline" as const,
        title: "注意事項",
        description: "編集時にご注意ください",
      };
  }
}

/**
 * 制限アイテム表示コンポーネント
 */
interface RestrictionItemProps {
  restriction: ActiveRestriction;
  compact?: boolean;
}

function RestrictionItem({ restriction, compact = false }: RestrictionItemProps) {
  const { rule, evaluation } = restriction;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Badge variant={getRestrictionLevelProps(rule.level).badgeVariant}>{rule.field}</Badge>
        <span className="text-sm font-medium">{rule.name}</span>
      </div>

      <div className="text-sm text-muted-foreground">
        <p>{evaluation.message}</p>
        {!compact && evaluation.details && <p className="mt-1 text-xs">{evaluation.details}</p>}
        {!compact && evaluation.suggestedAction && (
          <p className="mt-1 text-xs font-medium text-primary">💡 {evaluation.suggestedAction}</p>
        )}
      </div>
    </div>
  );
}

/**
 * 制限レベル別表示コンポーネント
 */
interface RestrictionLevelSectionProps {
  level: RestrictionLevel;
  restrictions: ActiveRestriction[];
  compact?: boolean;
}

function RestrictionLevelSection({
  level,
  restrictions,
  compact = false,
}: RestrictionLevelSectionProps) {
  if (restrictions.length === 0) return null;

  const levelProps = getRestrictionLevelProps(level);
  const Icon = levelProps.icon;

  return (
    <Alert variant={levelProps.variant} className="space-y-3">
      <Icon className="h-4 w-4" />
      <div className="space-y-3">
        <div>
          <AlertTitle>{levelProps.title}</AlertTitle>
          {!compact && (
            <AlertDescription className="text-xs text-muted-foreground">
              {levelProps.description}
            </AlertDescription>
          )}
        </div>

        <div className="space-y-3">
          {restrictions.map((restriction, index) => (
            <RestrictionItem
              key={`${restriction.rule.id}-${index}`}
              restriction={restriction}
              compact={compact}
            />
          ))}
        </div>
      </div>
    </Alert>
  );
}

/**
 * ローディング表示コンポーネント
 */
function LoadingState() {
  return (
    <Alert>
      <InfoIcon className="h-4 w-4" />
      <AlertDescription>制限情報を確認しています...</AlertDescription>
    </Alert>
  );
}

/**
 * エラー表示コンポーネント
 */
interface ErrorStateProps {
  error: string;
  onRetry?: () => void;
}

function ErrorState({ error, onRetry }: ErrorStateProps) {
  return (
    <Alert variant="destructive">
      <XCircleIcon className="h-4 w-4" />
      <AlertTitle>制限情報の取得に失敗しました</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>{error}</p>
        {onRetry && (
          <button onClick={onRetry} className="text-sm underline hover:no-underline">
            再試行
          </button>
        )}
      </AlertDescription>
    </Alert>
  );
}

// =============================================================================
// Main Component - メインコンポーネント
// =============================================================================

/**
 * 統一制限表示コンポーネント V2
 * フォーム値の変化に即座に反応し、リアルタイムで制限状態を表示
 */
export function UnifiedRestrictionNoticeV2({
  restrictions,
  formData,
  showLevels = ["structural", "conditional", "advisory"],
  compact = false,
  className = "",
  debug = false,
}: UnifiedRestrictionNoticeV2Props) {
  // ---------------------------------------------------------------------------
  // Hooks & State
  // ---------------------------------------------------------------------------

  const { restrictionState, isLoading, error, refreshRestrictions, clearError } =
    useUnifiedRestrictions(restrictions, formData, { debug });

  // ---------------------------------------------------------------------------
  // Data Processing
  // ---------------------------------------------------------------------------

  const displaySections = useMemo(() => {
    const sections: { level: RestrictionLevel; restrictions: ActiveRestriction[] }[] = [];

    showLevels.forEach((level) => {
      const restrictions = restrictionState[level];
      if (restrictions.length > 0) {
        sections.push({ level, restrictions });
      }
    });

    return sections;
  }, [restrictionState, showLevels]);

  const hasAnyRestrictions = useMemo(() => {
    return displaySections.length > 0;
  }, [displaySections]);

  // ---------------------------------------------------------------------------
  // Event Handlers
  // ---------------------------------------------------------------------------

  const handleRetry = () => {
    clearError();
    refreshRestrictions();
  };

  // ---------------------------------------------------------------------------
  // Debug Information
  // ---------------------------------------------------------------------------

  // debug情報は開発環境のみの機能なので、console.logは許容範囲内
  // ただし、将来的な監視基盤のためにloggerに統一
  if (debug && typeof window !== "undefined" && process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.log("[UnifiedRestrictionNoticeV2] Render state:", {
      restrictions,
      formData,
      restrictionState,
      isLoading,
      error,
      displaySections,
      hasAnyRestrictions,
    });
  }

  // ---------------------------------------------------------------------------
  // Render Logic
  // ---------------------------------------------------------------------------

  // ローディング中
  if (isLoading) {
    return (
      <div className={className}>
        <LoadingState />
      </div>
    );
  }

  // エラー状態
  if (error) {
    return (
      <div className={className}>
        <ErrorState error={error} onRetry={handleRetry} />
      </div>
    );
  }

  // 制限なし
  if (!hasAnyRestrictions) {
    return null; // 制限がない場合は何も表示しない
  }

  // 制限表示
  return (
    <div className={`space-y-4 ${className}`}>
      {displaySections.map(({ level, restrictions }) => (
        <RestrictionLevelSection
          key={level}
          level={level}
          restrictions={restrictions}
          compact={compact}
        />
      ))}

      {debug && (
        <Alert variant="default" className="text-xs">
          <InfoIcon className="h-3 w-3" />
          <AlertDescription>
            <details>
              <summary className="cursor-pointer">Debug Info</summary>
              <pre className="mt-2 whitespace-pre-wrap">
                {JSON.stringify(
                  {
                    restrictionState,
                    lastUpdated: new Date(restrictionState.lastUpdated).toISOString(),
                  },
                  null,
                  2
                )}
              </pre>
            </details>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

// =============================================================================
// Preset Components - プリセットコンポーネント
// =============================================================================

/**
 * 構造的制限のみ表示（エラー扱い）
 */
export function StructuralRestrictionsOnly(
  props: Omit<UnifiedRestrictionNoticeV2Props, "showLevels">
) {
  return <UnifiedRestrictionNoticeV2 {...props} showLevels={["structural"]} />;
}

/**
 * 注意事項のみ表示（情報提供）
 */
export function AdvisoryRestrictionsOnly(
  props: Omit<UnifiedRestrictionNoticeV2Props, "showLevels">
) {
  return <UnifiedRestrictionNoticeV2 {...props} showLevels={["advisory"]} />;
}

/**
 * コンパクト版制限表示
 */
export function CompactRestrictionNotice(props: Omit<UnifiedRestrictionNoticeV2Props, "compact">) {
  return <UnifiedRestrictionNoticeV2 {...props} compact={true} />;
}

// =============================================================================
// Export Default
// =============================================================================

export default UnifiedRestrictionNoticeV2;
