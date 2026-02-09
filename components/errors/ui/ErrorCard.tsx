/**
 * 統一されたエラーカードUIコンポーネント
 */

"use client";

import type { ReactNode } from "react";

import { cn } from "@core/utils";

import { Card } from "@/components/ui/card";

import type { ErrorPageProps } from "../types";

import { ErrorActions } from "./ErrorActions";
import { ErrorIcon } from "./ErrorIcon";

interface ErrorCardProps extends ErrorPageProps {
  size?: "sm" | "md" | "lg";
  centered?: boolean;
  fullHeight?: boolean;
  className?: string;
  children?: ReactNode;
}

/**
 * 統一されたエラーカードコンポーネント
 */
export function ErrorCard({
  code,
  category,
  severity = "medium",
  title,
  message,
  description,
  showRetry = false,
  showHome = true,
  showBack = false,
  showSupport = false,
  customActions = [],
  retryLabel,
  onRetry,
  error,
  reset,
  size = "md",
  centered = true,
  fullHeight = true,
  className = "",
  children,
}: ErrorCardProps) {
  // サイズに応じたスタイリング
  const sizeClasses = {
    sm: {
      card: "max-w-sm p-6",
      icon: "sm" as const,
      title: "text-lg",
      message: "text-sm",
    },
    md: {
      card: "max-w-md p-8",
      icon: "lg" as const,
      title: "text-2xl",
      message: "text-base",
    },
    lg: {
      card: "max-w-lg p-10",
      icon: "xl" as const,
      title: "text-3xl",
      message: "text-lg",
    },
  };

  const styles = sizeClasses[size];

  // 重要度に応じた境界線の色
  const severityBorderClasses = {
    low: "border-muted",
    medium: "border-warning/30",
    high: "border-destructive/30",
    critical: "border-destructive/50 shadow-destructive/10",
  };

  return (
    <div
      className={cn(
        "flex items-center justify-center px-4",
        fullHeight && "min-h-screen",
        centered && "text-center",
        !fullHeight && "py-8",
        className
      )}
    >
      <Card className={cn("w-full", styles.card, severityBorderClasses[severity])}>
        {/* エラーアイコン */}
        <div className="mb-6">
          <ErrorIcon category={category} code={code} size={styles.icon} className="mx-auto" />
        </div>

        {/* エラー情報 */}
        <div className="mb-6">
          <h1 className={cn("font-bold text-foreground mb-2", styles.title)}>{title}</h1>
          <p className={cn("text-muted-foreground mb-2", styles.message)}>{message}</p>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>

        {/* 子コンテンツ（追加情報など） */}
        {children && <div className="mb-6">{children}</div>}

        {/* 開発環境でのエラー詳細 */}
        {process.env.NODE_ENV === "development" && error && (
          <details className="mb-6 text-left">
            <summary className="cursor-pointer text-sm text-muted-foreground mb-2 hover:text-foreground">
              エラー詳細（開発環境のみ）
            </summary>
            <div className="text-xs bg-muted/30 p-3 rounded border overflow-auto max-h-40">
              <div className="mb-2">
                <strong>エラーメッセージ:</strong>
                <pre className="mt-1 text-destructive">{error.message}</pre>
              </div>
              {error.stack && (
                <div>
                  <strong>スタックトレース:</strong>
                  <pre className="mt-1 text-foreground whitespace-pre-wrap">{error.stack}</pre>
                </div>
              )}
            </div>
          </details>
        )}

        {/* アクションボタン */}
        <ErrorActions
          showRetry={showRetry}
          showHome={showHome}
          showBack={showBack}
          showSupport={showSupport}
          customActions={customActions}
          retryLabel={retryLabel}
          onRetry={reset || onRetry}
        />
      </Card>
    </div>
  );
}

/**
 * インライン（コンポーネント内）エラーカード
 */
interface InlineErrorCardProps extends Omit<ErrorCardProps, "fullHeight" | "centered"> {
  compact?: boolean;
}

export function InlineErrorCard({
  compact = false,
  className = "",
  ...props
}: InlineErrorCardProps) {
  return (
    <ErrorCard
      {...props}
      size={compact ? "sm" : "md"}
      fullHeight={false}
      centered={false}
      className={cn("py-4", className)}
    />
  );
}
