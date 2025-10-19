/**
 * メール通知サービスの実装
 */

import { randomUUID } from "crypto";

import * as React from "react";

import { Resend } from "resend";

import { logger } from "@core/logging/app-logger";
import { getEnv } from "@core/utils/cloudflare-env";

import {
  IEmailNotificationService,
  EmailTemplate,
  NotificationResult,
  ResendErrorInfo,
} from "./types";

// タイムアウト設定（ミリ秒）
const RESEND_TIMEOUT_MS = 30000;

// リトライ設定
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
const RATE_LIMIT_RETRY_DELAY_MS = 5000;

/**
 * メールアドレスをマスクする（ログ用）
 */
function maskEmail(email: string): string {
  const parts = email.split("@");
  if (parts.length !== 2) return "***";
  const [local, domain] = parts;
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}${"*".repeat(local.length - 1)}@${domain}`;
}

/**
 * Resendエラーを分類する
 */
function classifyResendError(error: any): ResendErrorInfo {
  // Resend APIエラーの構造:
  // { message: string, name?: string, statusCode?: number }

  const message = error?.message || String(error);
  const statusCode = error?.statusCode;
  const name = error?.name;

  // ステータスコードによる分類
  if (statusCode) {
    // 4xx系エラー
    if (statusCode >= 400 && statusCode < 500) {
      // 429: レート制限（一時的）
      if (statusCode === 429) {
        return {
          type: "transient",
          message: "レート制限エラー",
          statusCode,
          name,
        };
      }
      // 401, 403: 認証エラー（恒久的）
      if (statusCode === 401 || statusCode === 403) {
        return {
          type: "permanent",
          message: "認証エラー",
          statusCode,
          name,
        };
      }
      // 400, 422: バリデーションエラー（恒久的）
      if (statusCode === 400 || statusCode === 422) {
        return {
          type: "permanent",
          message: message || "バリデーションエラー",
          statusCode,
          name,
        };
      }
      // その他の4xxは恒久的
      return {
        type: "permanent",
        message: message || "クライアントエラー",
        statusCode,
        name,
      };
    }

    // 5xx系エラー（サーバーエラー、一時的）
    if (statusCode >= 500) {
      return {
        type: "transient",
        message: message || "サーバーエラー",
        statusCode,
        name,
      };
    }
  }

  // メッセージによる分類
  const lowerMessage = message.toLowerCase();

  // ネットワークエラー（一時的）
  if (
    lowerMessage.includes("network") ||
    lowerMessage.includes("timeout") ||
    lowerMessage.includes("econnrefused") ||
    lowerMessage.includes("enotfound") ||
    lowerMessage.includes("etimedout")
  ) {
    return {
      type: "transient",
      message: "ネットワークエラー",
      statusCode,
      name,
    };
  }

  // 無効なメールアドレス（恒久的）
  if (
    lowerMessage.includes("invalid email") ||
    lowerMessage.includes("invalid recipient") ||
    lowerMessage.includes("invalid address")
  ) {
    return {
      type: "permanent",
      message: "無効なメールアドレス",
      statusCode,
      name,
    };
  }

  // デフォルトは一時的エラーとして扱う（安全側に倒す）
  return {
    type: "transient",
    message: message || "不明なエラー",
    statusCode,
    name,
  };
}

/**
 * 指数バックオフでスリープ
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 環境変数をバリデーション
 */
function validateEmailConfig(): { fromEmail: string; adminEmail: string } {
  const isDev = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";

  let fromEmail = getEnv().FROM_EMAIL;
  let adminEmail = getEnv().ADMIN_EMAIL;

  // 本番環境では必須
  if (!isDev) {
    if (!fromEmail) {
      throw new Error(
        "FROM_EMAIL environment variable is required in production. Please set it in your environment variables."
      );
    }
    if (!adminEmail) {
      throw new Error(
        "ADMIN_EMAIL environment variable is required in production. Please set it in your environment variables."
      );
    }
  }

  // 開発環境でのデフォルト値
  if (!fromEmail) {
    fromEmail = "noreply@eventpay.jp";
    logger.warn("FROM_EMAIL not set, using default", {
      tag: "emailService",
      default_value: fromEmail,
    });
  }

  if (!adminEmail) {
    adminEmail = "admin@eventpay.jp";
    logger.warn("ADMIN_EMAIL not set, using default", {
      tag: "emailService",
      default_value: adminEmail,
    });
  }

  return { fromEmail, adminEmail };
}

/**
 * Resendを使用したメール通知サービス
 */
export class EmailNotificationService implements IEmailNotificationService {
  private resend: Resend;
  private fromEmail: string;
  private adminEmail: string;

  constructor() {
    const apiKey = getEnv().RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY environment variable is required");
    }

    this.resend = new Resend(apiKey);

    // 環境変数をバリデーション
    const config = validateEmailConfig();
    this.fromEmail = config.fromEmail;
    this.adminEmail = config.adminEmail;
  }

  /**
   * メール送信（React Emailテンプレート使用）
   * リトライロジック付き
   */
  async sendEmail(params: { to: string; template: EmailTemplate }): Promise<NotificationResult> {
    const { to, template } = params;
    const idempotencyKey = randomUUID();

    // ログ用にマスクされたメールアドレス
    const maskedTo = maskEmail(to);

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        // タイムアウト付きでメール送信を実行
        const result = await this.sendEmailWithTimeout({
          from: template.from || this.fromEmail,
          to: [to],
          subject: template.subject,
          react: template.react,
          ...(template.replyTo && { reply_to: template.replyTo }),
          headers: {
            "X-Idempotency-Key": idempotencyKey,
          },
        });

        // result.errorがある場合
        if (result.error) {
          const errorInfo = classifyResendError(result.error);

          logger.error("Resend API returned error", {
            tag: "emailService",
            to: maskedTo,
            subject: template.subject,
            error_type: errorInfo.type,
            error_message: errorInfo.message,
            status_code: errorInfo.statusCode,
            error_name: errorInfo.name,
            attempt: attempt + 1,
            max_retries: MAX_RETRIES,
          });

          // 恒久的エラーの場合はリトライしない
          if (errorInfo.type === "permanent") {
            return {
              success: false,
              error: errorInfo.message,
              errorType: "permanent",
              statusCode: errorInfo.statusCode,
              retryCount: attempt,
            };
          }

          // 一時的エラーで最後のリトライの場合
          if (attempt === MAX_RETRIES) {
            return {
              success: false,
              error: errorInfo.message,
              errorType: "transient",
              statusCode: errorInfo.statusCode,
              retryCount: attempt,
            };
          }

          // リトライ待機
          const delay =
            errorInfo.statusCode === 429
              ? RATE_LIMIT_RETRY_DELAY_MS
              : INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);

          logger.info("Retrying email send after delay", {
            tag: "emailService",
            to: maskedTo,
            attempt: attempt + 1,
            delay_ms: delay,
          });

          await sleep(delay);
          continue;
        }

        // 成功
        logger.info("Email sent successfully", {
          tag: "emailService",
          to: maskedTo,
          subject: template.subject,
          message_id: result.data?.id,
          attempt: attempt + 1,
        });

        return {
          success: true,
          messageId: result.data?.id,
          retryCount: attempt,
        };
      } catch (error) {
        const errorInfo = classifyResendError(error);

        logger.error("Email sending exception", {
          tag: "emailService",
          to: maskedTo,
          subject: template.subject,
          error_type: errorInfo.type,
          error_name: error instanceof Error ? error.name : "Unknown",
          error_message: error instanceof Error ? error.message : String(error),
          status_code: errorInfo.statusCode,
          attempt: attempt + 1,
          max_retries: MAX_RETRIES,
        });

        // 恒久的エラーの場合はリトライしない
        if (errorInfo.type === "permanent") {
          return {
            success: false,
            error: errorInfo.message,
            errorType: "permanent",
            statusCode: errorInfo.statusCode,
            retryCount: attempt,
          };
        }

        // 最後のリトライの場合
        if (attempt === MAX_RETRIES) {
          return {
            success: false,
            error: errorInfo.message,
            errorType: "transient",
            statusCode: errorInfo.statusCode,
            retryCount: attempt,
          };
        }

        // リトライ待機
        const delay =
          errorInfo.statusCode === 429
            ? RATE_LIMIT_RETRY_DELAY_MS
            : INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);

        logger.info("Retrying email send after error", {
          tag: "emailService",
          to: maskedTo,
          attempt: attempt + 1,
          delay_ms: delay,
        });

        await sleep(delay);
      }
    }

    // ここには到達しないはずだが、念のため
    return {
      success: false,
      error: "メール送信中に予期しないエラーが発生しました",
      errorType: "transient",
      retryCount: MAX_RETRIES,
    };
  }

  /**
   * タイムアウト付きでメール送信を実行
   */
  private async sendEmailWithTimeout(params: Parameters<typeof this.resend.emails.send>[0]) {
    return Promise.race([
      this.resend.emails.send(params),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Email send timeout")), RESEND_TIMEOUT_MS)
      ),
    ]);
  }

  /**
   * 管理者向けアラートメール送信
   * 注意: このメソッドが失敗した場合、循環参照を避けるため追加のアラートは送信しません
   */
  async sendAdminAlert(params: {
    subject: string;
    message: string;
    details?: Record<string, any>;
  }): Promise<NotificationResult> {
    try {
      const { subject, message, details } = params;

      // Dynamic import to avoid build-time issues
      const { default: AdminAlertEmail } = await import("@/emails/admin/AdminAlertEmail");

      const template: EmailTemplate = {
        subject: `[EventPay Alert] ${subject}`,
        react: React.createElement(AdminAlertEmail, {
          subject,
          message,
          details,
        }),
        from: this.fromEmail,
      };

      const result = await this.sendEmail({
        to: this.adminEmail,
        template,
      });

      // 管理者アラート送信に失敗した場合は詳細をログに記録
      if (!result.success) {
        logger.error("Admin alert email failed", {
          tag: "emailService",
          subject,
          error: result.error,
          error_type: result.errorType,
          status_code: result.statusCode,
          retry_count: result.retryCount,
          admin_email: maskEmail(this.adminEmail),
        });
      }

      return result;
    } catch (error) {
      // テンプレート読み込みエラーなど、sendEmail以外でのエラー
      logger.error("Admin alert email error", {
        tag: "emailService",
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
        admin_email: maskEmail(this.adminEmail),
      });
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "管理者アラート送信中にエラーが発生しました",
        errorType: "permanent",
      };
    }
  }
}
