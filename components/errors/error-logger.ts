/**
 * エラーロギングシステム
 * 開発環境、本番環境でのエラー追跡とレポート機能
 */

import { ErrorInfo, ErrorLogEntry, ErrorReportingConfig } from "./error-types";

/**
 * 簡単なID生成関数
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
    const logEntry: ErrorLogEntry = {
      id: generateId(),
      timestamp: new Date(),
      error: errorInfo,
      environment: (process.env.NODE_ENV as "development" | "preview" | "production") || "development",
      stackTrace: originalError?.stack,
      breadcrumbs: this.breadcrumbs ? [...this.breadcrumbs] : [],
      user: context ? {
        id: context.userId,
        email: context.userEmail,
        userAgent: context.userAgent || (typeof window !== "undefined" ? window.navigator.userAgent : undefined),
        ip: undefined, // サーバーサイドで追加される
      } : undefined,
      page: context ? {
        url: context.url || (typeof window !== "undefined" ? window.location.href : ""),
        pathname: context.pathname || (typeof window !== "undefined" ? window.location.pathname : ""),
        referrer: context.referrer || (typeof document !== "undefined" ? document.referrer : undefined),
      } : undefined,
    };

    // 開発環境ではコンソールに出力
    if (this.config.environment === "development") {
      // eslint-disable-next-line no-console
      console.group(`🚨 Error: ${errorInfo.title}`);
      // eslint-disable-next-line no-console
      console.error("Error Info:", errorInfo);
      // eslint-disable-next-line no-console
      console.error("Original Error:", originalError);
      // eslint-disable-next-line no-console
      console.error("Context:", context);
      // eslint-disable-next-line no-console
      console.error("Stack Trace:", originalError?.stack);
      // eslint-disable-next-line no-console
      console.groupEnd();
    }

    // 本番環境でのエラーレポート
    if (this.config.enabled && this.config.environment === "production") {
      try {
        await this.sendErrorReport(logEntry);
      } catch (reportError) {
        // eslint-disable-next-line no-console
        console.error("Failed to send error report:", reportError);
      }
    }

    // ローカルストレージに保存（デバッグ用）
    this.saveToLocalStorage(logEntry);
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
    if (!this.config.apiEndpoint || !this.config.apiKey) {
      return;
    }

    // サンプリング制御
    if (this.config.sampleRate && Math.random() > this.config.sampleRate) {
      return;
    }

    // レポートデータを準備
    const reportData = {
      ...logEntry,
      stackTrace: this.config.includeStackTrace ? logEntry.stackTrace : undefined,
      user: this.config.includeUserInfo ? logEntry.user : undefined,
      breadcrumbs: this.config.includeBreadcrumbs ? logEntry.breadcrumbs : undefined,
    };

    const response = await fetch(this.config.apiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(reportData),
    });

    if (!response.ok) {
      throw new Error(`Failed to send error report: ${response.status}`);
    }
  }

  /**
   * ローカルストレージに保存（デバッグ用）
   */
  private saveToLocalStorage(logEntry: ErrorLogEntry): void {
    if (typeof window === "undefined") return;

    try {
      const key = `eventpay_error_log`;
      const existingLogs = JSON.parse(localStorage.getItem(key) || "[]");
      const maxLogs = 10;

      existingLogs.push({
        ...logEntry,
        timestamp: logEntry.timestamp.toISOString(),
      });

      // 最大数を超えた場合は古いものを削除
      if (existingLogs.length > maxLogs) {
        existingLogs.splice(0, existingLogs.length - maxLogs);
      }

      localStorage.setItem(key, JSON.stringify(existingLogs));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("Failed to save error to localStorage:", error);
    }
  }

  /**
   * ローカルストレージからエラーログを取得
   */
  getLocalLogs(): ErrorLogEntry[] {
    if (typeof window === "undefined") return [];

    try {
      const logs = JSON.parse(localStorage.getItem("eventpay_error_log") || "[]");
      return logs.map((log: ErrorLogEntry & { timestamp: string }) => ({
        ...log,
        timestamp: new Date(log.timestamp),
      }));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("Failed to get error logs from localStorage:", error);
      return [];
    }
  }

  /**
   * ローカルストレージのエラーログをクリア
   */
  clearLocalLogs(): void {
    if (typeof window === "undefined") return;
    localStorage.removeItem("eventpay_error_log");
  }
}

/**
 * グローバルエラーロガーインスタンス
 */
const errorLogger = new ErrorLogger({
  enabled: process.env.NODE_ENV === "production",
  environment: (process.env.NODE_ENV as "development" | "preview" | "production") || "development",
  sampleRate: 1.0, // 本番環境では適切な値に調整
  includeStackTrace: true,
  includeUserInfo: false, // プライバシーを考慮
  includeBreadcrumbs: true,
  // 本番環境では実際のエンドポイントとAPIキーを設定
  apiEndpoint: process.env.ERROR_REPORTING_ENDPOINT,
  apiKey: process.env.ERROR_REPORTING_API_KEY,
});

export { ErrorLogger, errorLogger };

/**
 * エラーロギングのヘルパー関数
 */
export const logError = errorLogger.logError.bind(errorLogger);
export const addBreadcrumb = errorLogger.addBreadcrumb.bind(errorLogger);
export const getLocalLogs = errorLogger.getLocalLogs.bind(errorLogger);
export const clearLocalLogs = errorLogger.clearLocalLogs.bind(errorLogger);
