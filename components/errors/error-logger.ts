/**
 * エラーロギングシステム
 * 開発環境、本番環境でのエラー追跡とレポート機能
 */

import type { LucideIcon } from "lucide-react";

import type { ErrorCategory, ErrorCode, ErrorSeverity } from "@core/errors/types";

export interface ErrorInfo {
  code: ErrorCode;
  category: ErrorCategory;
  severity: ErrorSeverity;
  title?: string;
  message: string;
  userMessage?: string;
  description?: string;
  icon?: LucideIcon;
  timestamp?: Date;
  digest?: string;
  retryable?: boolean;
  correlationId?: string;
  context?: Record<string, unknown>;
}

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
    url?: string;
    pathname?: string;
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

/**
 * 簡単なID生成関数
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function toOptionalNonEmptyString(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return value.trim().length > 0 ? value : undefined;
}

/**
 * エラーロガークラス
 */
class ErrorLogger {
  private config: ErrorReportingConfig;
  private breadcrumbs: ErrorLogEntry["breadcrumbs"] = [];
  private maxBreadcrumbs = 50;

  constructor(config: ErrorReportingConfig) {
    this.config = config;
  }

  /**
   * エラーをログに記録
   */
  async logError(
    errorInfo: ErrorInfo,
    originalError?: Error,
    context?: {
      userId?: string;
      userEmail?: string;
      url?: string;
      pathname?: string;
      userAgent?: string;
      referrer?: string;
    }
  ): Promise<void> {
    const page = (() => {
      if (!context) {
        return undefined;
      }

      const resolvedPage = {
        url: toOptionalNonEmptyString(
          context.url || (typeof window !== "undefined" ? window.location.href : undefined)
        ),
        pathname: toOptionalNonEmptyString(
          context.pathname || (typeof window !== "undefined" ? window.location.pathname : undefined)
        ),
        referrer: toOptionalNonEmptyString(
          context.referrer || (typeof document !== "undefined" ? document.referrer : undefined)
        ),
      };

      if (!resolvedPage.url && !resolvedPage.pathname && !resolvedPage.referrer) {
        return undefined;
      }

      return resolvedPage;
    })();

    const logEntry: ErrorLogEntry = {
      id: generateId(),
      timestamp: new Date(),
      error: errorInfo,
      environment:
        (process.env.NODE_ENV as "development" | "preview" | "production") || "development",
      stackTrace: originalError?.stack,
      breadcrumbs: this.breadcrumbs ? [...this.breadcrumbs] : [],
      user: context
        ? {
            id: context.userId,
            email: context.userEmail,
            userAgent:
              context.userAgent ||
              (typeof window !== "undefined" ? window.navigator.userAgent : undefined),
            ip: undefined, // サーバーサイドで追加される
          }
        : undefined,
      page,
    };

    // 開発環境ではコンソールに出力
    if (this.config.environment === "development") {
      // eslint-disable-next-line no-console
      console.group(`🚨 Error: ${errorInfo.title || errorInfo.code}`);

      console.error("Error Info:", errorInfo);

      console.error("Original Error:", originalError);

      console.error("Context:", context);

      console.error("Stack Trace:", originalError?.stack);
      // eslint-disable-next-line no-console
      console.groupEnd();
    }

    // 本番環境でのエラーレポート
    if (this.config.enabled && this.config.environment === "production") {
      try {
        await this.sendErrorReport(logEntry);
      } catch (reportError) {
        console.error("Failed to send error report:", reportError);
      }
    }
  }

  /**
   * パンくずリストに記録を追加
   */
  addBreadcrumb(
    category: string,
    message: string,
    level: "info" | "warning" | "error" = "info",
    data?: Record<string, unknown>
  ): void {
    if (this.breadcrumbs) {
      this.breadcrumbs.push({
        timestamp: new Date(),
        category,
        message,
        level,
        data,
      });

      // 最大数を超えた場合は古いものを削除
      if (this.breadcrumbs.length > this.maxBreadcrumbs) {
        this.breadcrumbs.shift();
      }
    }
  }

  /**
   * エラーレポートを外部サービスに送信
   */
  private async sendErrorReport(logEntry: ErrorLogEntry): Promise<void> {
    if (!this.config.apiEndpoint) {
      return;
    }

    // サンプリング制御
    if (this.config.sampleRate && Math.random() > this.config.sampleRate) {
      return;
    }

    // レポートデータを準備
    const reportData = {
      error: logEntry.error,
      stackTrace: this.config.includeStackTrace ? logEntry.stackTrace : undefined,
      user: this.config.includeUserInfo ? logEntry.user : undefined,
      breadcrumbs: this.config.includeBreadcrumbs ? logEntry.breadcrumbs : undefined,
      page: logEntry.page,
      environment: logEntry.environment,
    };

    const response = await fetch(this.config.apiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(reportData),
      keepalive: true,
    });

    if (!response.ok) {
      throw new Error(`Failed to send error report: ${response.status}`);
    }
  }
}

/**
 * グローバルエラーロガーインスタンス
 */
const errorLogger = new ErrorLogger({
  enabled: process.env.NODE_ENV === "production",
  environment: (process.env.NODE_ENV as "development" | "preview" | "production") || "development",
  sampleRate: 1.0,
  includeStackTrace: true,
  includeUserInfo: false,
  includeBreadcrumbs: true,
  apiEndpoint: "/api/errors",
});

export { ErrorLogger, errorLogger };

/**
 * エラーロギングのヘルパー関数
 */
export const logError = errorLogger.logError.bind(errorLogger);
export const addBreadcrumb = errorLogger.addBreadcrumb.bind(errorLogger);
