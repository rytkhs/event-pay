"use client";

/**
 * 統一制限表示コンポーネント V2 - 常時表示版
 */

import React, { useMemo, useState } from "react";

import {
  InfoIcon,
  CheckCircle2Icon,
  LightbulbIcon,
  RefreshCwIcon,
  BanIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  LockIcon,
} from "lucide-react";

import {
  RestrictionContext,
  FormDataSnapshot,
  RestrictionLevel,
  ActiveRestriction,
} from "@core/domain/event-edit-restrictions";

import { cn } from "@/components/ui/_lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

import { useUnifiedRestrictions } from "../hooks/useUnifiedRestrictions";

// =============================================================================
// Component Props
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
// Internal Components & Styles
// =============================================================================

const LEVEL_CONFIG = {
  structural: {
    icon: LockIcon,
    bgClass: "bg-slate-50 dark:bg-slate-900/20",
    borderClass: "border-slate-200 dark:border-slate-800/50",
    textClass: "text-foreground",
    iconColorClass: "text-slate-500 dark:text-slate-400",
    title: "変更不可項目",
  },
  conditional: {
    icon: LockIcon,
    bgClass: "bg-amber-50/30 dark:bg-amber-950/10",
    borderClass: "border-amber-200/50 dark:border-amber-900/30",
    textClass: "text-foreground",
    iconColorClass: "text-amber-600 dark:text-amber-500",
    title: "条件付き変更不可",
  },
  advisory: {
    icon: InfoIcon,
    bgClass: "bg-blue-50/30 dark:bg-blue-950/10",
    borderClass: "border-blue-200/50 dark:border-blue-900/30",
    textClass: "text-foreground",
    iconColorClass: "text-blue-600 dark:text-blue-400",
    title: "確認事項",
  },
};

interface RestrictionItemProps {
  restriction: ActiveRestriction;
  level: RestrictionLevel;
  isLast?: boolean;
  compact?: boolean;
}

function RestrictionItem({
  restriction,
  level,
  isLast = false,
  compact = false,
}: RestrictionItemProps) {
  const { evaluation } = restriction;
  const config = LEVEL_CONFIG[level];

  return (
    <div
      className={cn(
        "flex flex-col gap-2 py-3 px-4 transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-900/50",
        !isLast && "border-b border-border/40"
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn("mt-0.5 shrink-0", config.iconColorClass)}>
          <config.icon className="h-4 w-4" />
        </div>

        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("text-sm font-bold", config.textClass)}>{evaluation.message}</span>
          </div>

          {!compact && (
            <>
              {evaluation.details && (
                <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                  {evaluation.details}
                </p>
              )}

              {evaluation.suggestedAction && (
                <div className="flex items-center gap-2 mt-2 text-xs bg-slate-100 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 p-2 rounded border border-slate-200 dark:border-slate-700/50">
                  <LightbulbIcon className="h-3 w-3 shrink-0" />
                  <span className="font-medium">{evaluation.suggestedAction}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// States Components
// =============================================================================

function LoadingState() {
  return (
    <div className="flex items-center justify-center p-4 rounded-xl border border-dashed bg-muted/20 text-muted-foreground text-xs animate-pulse gap-2">
      <RefreshCwIcon className="h-3.5 w-3.5 animate-spin" />
      <span>確認中...</span>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 animate-in fade-in">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-destructive">
          <BanIcon className="h-4 w-4 shrink-0" />
          <span className="text-xs font-semibold">{error}</span>
        </div>
        {onRetry && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRetry}
            className="h-6 text-xs hover:bg-destructive/10 text-destructive"
          >
            再試行
          </Button>
        )}
      </div>
    </div>
  );
}

function NoRestrictionsState({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-green-200/50 bg-green-50/50 dark:bg-green-950/20 dark:border-green-800/50",
        "p-3 flex items-center gap-3 transition-all duration-300 animate-in fade-in",
        className
      )}
    >
      <CheckCircle2Icon className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
      <span className="text-sm font-medium text-green-700 dark:text-green-400">
        全ての項目を編集可能です
      </span>
    </div>
  );
}

// =============================================================================
// Combined Display Component
// =============================================================================

function CombinedRestrictionsValidation({
  sections,
  className,
  compact = false,
}: {
  sections: { level: RestrictionLevel; restrictions: ActiveRestriction[] }[];
  className?: string;
  compact?: boolean;
}) {
  // 最も深刻なレベルを判定してヘッダーの色を決める
  const severities: RestrictionLevel[] = ["structural", "conditional", "advisory"];
  const worstLevel = severities.find((s) => sections.some((sec) => sec.level === s)) || "advisory";

  const totalCount = sections.reduce((acc, sec) => acc + sec.restrictions.length, 0);

  // 初期状態: 常に閉じた状態
  const hasBlockingIssues = sections.some(
    (s) => s.level === "structural" || s.level === "conditional"
  );
  const [isOpen, setIsOpen] = useState(false);

  const headerConfig = LEVEL_CONFIG[worstLevel];

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={cn(
        "rounded-xl border bg-white dark:bg-card overflow-hidden shadow-sm transition-all",
        "border-border/60",
        className
      )}
    >
      <CollapsibleTrigger asChild>
        <div
          className={cn(
            "flex items-center justify-between px-4 py-3 cursor-pointer select-none transition-colors",
            "bg-slate-50/40 hover:bg-slate-50 dark:bg-slate-900/20 dark:hover:bg-slate-900/40"
          )}
        >
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "p-1.5 rounded-full bg-white dark:bg-slate-800 shadow-sm border border-slate-200/50 dark:border-slate-700",
                headerConfig.iconColorClass
              )}
            >
              {hasBlockingIssues ? (
                <LockIcon className="h-4 w-4" />
              ) : (
                <InfoIcon className="h-4 w-4" />
              )}
            </div>
            <div className="flex flex-col text-left">
              <span className={cn("text-sm font-bold", headerConfig.textClass)}>
                {hasBlockingIssues ? "一部変更できない設定があります" : "確認事項があります"}
              </span>
              {!isOpen && (
                <span className="text-[10px] text-muted-foreground">
                  クリックして詳細を確認 ({totalCount}件)
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Badge
              variant="secondary"
              className="bg-white/50 dark:bg-black/20 font-mono text-xs h-5 px-1.5"
            >
              {totalCount}
            </Badge>
            {isOpen ? (
              <ChevronUpIcon className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDownIcon className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="divide-y divide-border/50 border-t border-border/50">
          {sections.map((section) => (
            <div key={section.level} className="bg-card">
              {/* LeveL Header (Mini) */}
              <div
                className={cn(
                  "px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider bg-muted/30 text-muted-foreground flex items-center gap-2"
                )}
              >
                {LEVEL_CONFIG[section.level].title}
              </div>

              {/* Items List */}
              <div className="flex flex-col">
                {section.restrictions.map((restriction, idx) => (
                  <RestrictionItem
                    key={restriction.rule.id}
                    restriction={restriction}
                    level={section.level}
                    isLast={idx === section.restrictions.length - 1}
                    compact={compact}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * 統一制限表示コンポーネント V2
 */
export function UnifiedRestrictionNoticeV2({
  restrictions,
  formData,
  showLevels = ["structural", "conditional", "advisory"],
  compact = false,
  className = "",
  debug = false,
}: UnifiedRestrictionNoticeV2Props) {
  const { restrictionState, isLoading, error, refreshRestrictions, clearError } =
    useUnifiedRestrictions(restrictions, formData, { debug });

  const displaySections = useMemo(() => {
    const sections: { level: RestrictionLevel; restrictions: ActiveRestriction[] }[] = [];
    showLevels.forEach((level) => {
      const items = restrictionState[level];
      if (items.length > 0) {
        sections.push({ level, restrictions: items });
      }
    });
    return sections;
  }, [restrictionState, showLevels]);

  const handleRetry = () => {
    clearError();
    refreshRestrictions();
  };

  if (isLoading)
    return (
      <div className={className}>
        <LoadingState />
      </div>
    );
  if (error)
    return (
      <div className={className}>
        <ErrorState error={error} onRetry={handleRetry} />
      </div>
    );

  // 制限がない場合でも「制限なし」ステータスを表示する
  if (displaySections.length === 0) {
    return (
      <div className={className}>
        <NoRestrictionsState />
      </div>
    );
  }

  return (
    <CombinedRestrictionsValidation
      sections={displaySections}
      className={className}
      compact={compact}
    />
  );
}
