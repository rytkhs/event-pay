/**
 * UI 用エラー型定義（ErrorCode は core/errors を参照）
 */

import type { ReactNode } from "react";

import type { LucideIcon } from "lucide-react";

import type { ErrorCategory, ErrorCode, ErrorSeverity } from "@core/errors/types";

/**
 * エラーページのアクション設定
 */
export interface ErrorActionConfig {
  showRetry?: boolean;
  showHome?: boolean;
  showBack?: boolean;
  showSupport?: boolean;
  customActions?: Array<{
    label: string;
    action: () => void;
    variant?: "default" | "outline" | "destructive" | "secondary";
    icon?: LucideIcon;
  }>;
  retryLabel?: string;
  onRetry?: () => void;
}

/**
 * エラーページのプロパティ
 */
export interface ErrorPageProps extends ErrorActionConfig {
  code: ErrorCode;
  category?: ErrorCategory;
  severity?: ErrorSeverity;
  title?: string;
  message?: string;
  description?: string;
  icon?: LucideIcon;
  children?: ReactNode;
  error?: Error;
  reset?: () => void;
}

/**
 * Error Boundary用のプロパティ
 */
export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: React.ComponentType<ErrorFallbackProps>;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  level?: "page" | "component" | "global";
}

export interface ErrorFallbackProps {
  error?: Error;
  errorInfo?: React.ErrorInfo;
  resetError: () => void;
  level?: "page" | "component" | "global";
}
