/**
 * エラーハンドリングシステムの型定義
 * Next.js App Router + EventPayアプリケーション専用
 */

import type { ReactNode } from "react";

import type { LucideIcon } from "lucide-react";

/**
 * エラーの重要度レベル
 */
export type ErrorSeverity = "low" | "medium" | "high" | "critical";

/**
 * エラーカテゴリ
 */
export type ErrorCategory =
  | "network" // ネットワーク関連
  | "auth" // 認証・認可関連
  | "validation" // バリデーション関連
  | "business" // ビジネスロジック関連
  | "server" // サーバーエラー
  | "client" // クライアントエラー
  | "security" // セキュリティ関連
  | "payment" // 決済関連
  | "not-found" // 存在しないリソース
  | "unknown"; // 不明なエラー

/**
 * エラーコード（HTTPステータスコード + カスタムコード）
 */
export type ErrorCode =
  // HTTP 4xx
  | "400"
  | "401"
  | "403"
  | "404"
  | "409"
  | "422"
  | "429"
  // HTTP 5xx
  | "500"
  | "502"
  | "503"
  | "504"
  // カスタムビジネスエラー
  | "EVENT_ENDED"
  | "EVENT_FULL"
  | "REGISTRATION_CLOSED"
  | "DUPLICATE_REGISTRATION"
  | "INVALID_INVITE"
  | "PAYMENT_FAILED"
  | "INSUFFICIENT_BALANCE"
  | "RATE_LIMITED"
  | "MAINTENANCE";

/**
 * エラー情報の基本構造
 */
export interface ErrorInfo {
  code: ErrorCode;
  category: ErrorCategory;
  severity: ErrorSeverity;
  title: string;
  message: string;
  description?: string;
  icon?: LucideIcon;
  timestamp?: Date;
  digest?: string;
  context?: Record<string, unknown>;
}

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
export interface ErrorPageProps extends ErrorInfo, ErrorActionConfig {
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

/**
 * エラーログの構造
 */
export interface ErrorLogEntry {
  id: string;
  timestamp: Date;
  error: ErrorInfo;
  user?: {
    id?: string;
    email?: string;
    userAgent?: string;
    ip?: string;
  };
  page?: {
    url: string;
    pathname: string;
    referrer?: string;
  };
  environment: "development" | "preview" | "production";
  stackTrace?: string;
  breadcrumbs?: Array<{
    timestamp: Date;
    category: string;
    message: string;
    level: "info" | "warning" | "error";
    data?: Record<string, unknown>;
  }>;
}

/**
 * エラーレポート設定
 */
export interface ErrorReportingConfig {
  enabled: boolean;
  environment: "development" | "preview" | "production";
  apiEndpoint?: string;
  apiKey?: string;
  sampleRate?: number;
  includeStackTrace?: boolean;
  includeUserInfo?: boolean;
  includeBreadcrumbs?: boolean;
}
