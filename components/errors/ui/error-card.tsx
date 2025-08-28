/**
 * 統一されたエラーカードUIコンポーネント
 */

"use client";

import { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { ErrorIcon } from "./error-icon";
import { ErrorActions } from "./error-actions";
import { ErrorPageProps } from "../error-types";
import { cn } from "@/lib/utils";

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
    low: "border-gray-200",
    medium: "border-orange-200",
    high: "border-red-200",
    critical: "border-red-300 shadow-red-100",
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
          <h1 className={cn("font-bold text-gray-900 mb-2", styles.title)}>{title}</h1>
          <p className={cn("text-gray-600 mb-2", styles.message)}>{message}</p>
          {description && <p className="text-sm text-gray-500">{description}</p>}
        </div>

        {/* 子コンテンツ（追加情報など） */}
        {children && <div className="mb-6">{children}</div>}

        {/* 開発環境でのエラー詳細 */}
        {process.env.NODE_ENV === "development" && error && (
          <details className="mb-6 text-left">
            <summary className="cursor-pointer text-sm text-gray-500 mb-2 hover:text-gray-700">
              エラー詳細（開発環境のみ）
            </summary>
            <div className="text-xs bg-gray-100 p-3 rounded border overflow-auto max-h-40">
              <div className="mb-2">
                <strong>エラーメッセージ:</strong>
                <pre className="mt-1 text-red-600">{error.message}</pre>
              </div>
              {error.stack && (
                <div>
                  <strong>スタックトレース:</strong>
                  <pre className="mt-1 text-gray-700 whitespace-pre-wrap">{error.stack}</pre>
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

/**
 * 通知スタイルのエラーカード（フォーム内など）
 */
interface NotificationErrorCardProps {
  title: string;
  message: string;
  onDismiss?: () => void;
  onRetry?: () => void;
  className?: string;
}

export function NotificationErrorCard({
  title,
  message,
  onDismiss,
  onRetry,
  className = "",
}: NotificationErrorCardProps) {
  return (
    <Card className={cn("p-4 border-red-200 bg-red-50", className)}>
      <div className="flex items-start space-x-3">
        <ErrorIcon category="client" size="sm" className="flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-red-800 mb-1">{title}</h3>
          <p className="text-sm text-red-700 mb-3">{message}</p>
          <div className="flex space-x-2">
            {onRetry && (
              <button
                onClick={onRetry}
                className="text-sm text-red-800 hover:text-red-900 font-medium underline"
              >
                再試行
              </button>
            )}
            {onDismiss && (
              <button onClick={onDismiss} className="text-sm text-red-600 hover:text-red-700">
                閉じる
              </button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
