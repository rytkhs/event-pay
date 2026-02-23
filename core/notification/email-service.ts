/**
 * メール通知サービスの実装
 */

import { randomUUID } from "crypto";

import { Resend } from "resend";

import { AppError, errResult, okResult } from "@core/errors";
import { logger } from "@core/logging/app-logger";
import { getEnv } from "@core/utils/cloudflare-env";
import { handleServerError } from "@core/utils/error-handler.server";
import { toErrorLike } from "@core/utils/type-guards";

import { buildAdminAlertTemplate } from "./templates";
import {
  IEmailNotificationService,
  EmailTemplate,
  NotificationResult,
  ResendErrorInfo,
  ResendErrorType,
} from "./types";

// タイムアウト設定（ミリ秒）
const RESEND_TIMEOUT_MS = 30000;

// リトライ設定
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
const RATE_LIMIT_RETRY_DELAY_MS = 5000;

interface ResendApiSuccess {
  id?: string;
}

interface ResendApiError {
  message?: string;
  name?: string;
  statusCode?: number;
}

interface ResendApiResult {
  data: ResendApiSuccess | null;
  error: ResendApiError | null;
  retryAfterSeconds?: number;
}

interface ResendSendPayload {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  reply_to?: string;
  headers?: Record<string, string>;
}

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
function classifyResendError(error: unknown): ResendErrorInfo {
  // Resend APIエラーの構造:
  // { message: string, name?: string, statusCode?: number }

  const errorLike = toErrorLike(error);
  const message = errorLike.message || String(error);
  const statusCode = errorLike.statusCode;
  const name = errorLike.name;
  const normalizedName = name?.toLowerCase();

  // ステータスコードによる分類
  if (statusCode) {
    // 429: レート制限
    if (statusCode === 429) {
      // クォータ超過は恒久的（再試行しても解決しない）
      if (
        normalizedName === "monthly_quota_exceeded" ||
        normalizedName === "daily_quota_exceeded"
      ) {
        return {
          type: "permanent",
          message: message || "送信クォータ超過",
          statusCode,
          name,
        };
      }

      return {
        type: "transient",
        message: message || "レート制限エラー",
        statusCode,
        name,
      };
    }

    // 409: 冪等キー関連
    if (statusCode === 409) {
      if (normalizedName === "concurrent_idempotent_requests") {
        return {
          type: "transient",
          message: message || "同一冪等キーのリクエストが処理中です",
          statusCode,
          name,
        };
      }

      if (normalizedName === "invalid_idempotent_request") {
        return {
          type: "permanent",
          message: message || "冪等キーとリクエスト内容が不整合です",
          statusCode,
          name,
        };
      }

      return {
        type: "permanent",
        message: message || "重複リクエストエラー",
        statusCode,
        name,
      };
    }

    // 4xx系エラー
    if (statusCode >= 400 && statusCode < 500) {
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

function buildEmailErrorResult(options: {
  message: string;
  errorType: ResendErrorType;
  retryCount: number;
  statusCode?: number;
  retryAfterSeconds?: number;
}): NotificationResult {
  const appError = new AppError("EMAIL_SENDING_FAILED", {
    message: options.message,
    userMessage: "メール送信に失敗しました",
    retryable: options.errorType === "transient",
  });

  return errResult(appError, {
    errorType: options.errorType,
    retryCount: options.retryCount,
    statusCode: options.statusCode,
    retryAfterSeconds: options.retryAfterSeconds,
  });
}

function parseRetryAfterSeconds(
  headers: Record<string, string> | null | undefined
): number | undefined {
  if (!headers) return undefined;
  const value = headers["retry-after"] ?? headers["Retry-After"];
  if (!value) return undefined;

  const seconds = Number.parseInt(value, 10);
  if (Number.isNaN(seconds) || seconds < 0) {
    return undefined;
  }
  return seconds;
}

function resolveRetryDelayMs(options: {
  attempt: number;
  statusCode?: number;
  retryAfterSeconds?: number;
}): number {
  if (options.retryAfterSeconds && options.retryAfterSeconds > 0) {
    return options.retryAfterSeconds * 1000;
  }

  if (options.statusCode === 429) {
    return RATE_LIMIT_RETRY_DELAY_MS;
  }

  return INITIAL_RETRY_DELAY_MS * Math.pow(2, options.attempt);
}

/**
 * 環境変数をバリデーション
 */
function validateEmailConfig(): { fromEmail: string; fromName: string; adminEmail: string } {
  const env = getEnv();
  const isDev = env.NODE_ENV === "development" || env.NODE_ENV === "test";

  let fromEmail = getEnv().FROM_EMAIL;
  let fromName = getEnv().FROM_NAME;
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
      category: "email",
      action: "email_config_validation",
      default_value: fromEmail,
      outcome: "success",
    });
  }

  if (!fromName) {
    fromName = "みんなの集金";
    logger.warn("FROM_NAME not set, using default", {
      category: "email",
      action: "email_config_validation",
      default_value: fromName,
      outcome: "success",
    });
  }

  if (!adminEmail) {
    adminEmail = "admin@eventpay.jp";
    logger.warn("ADMIN_EMAIL not set, using default", {
      category: "email",
      action: "email_config_validation",
      default_value: adminEmail,
      outcome: "success",
    });
  }

  return { fromEmail, fromName, adminEmail };
}

/**
 * Resend APIを使用したメール通知サービス
 */
export class EmailNotificationService implements IEmailNotificationService {
  private resend: Resend;
  private fromEmail: string;
  private fromName: string;
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
    this.fromName = config.fromName;
    this.adminEmail = config.adminEmail;
  }

  /**
   * 構造化ロガー
   */
  private get logger() {
    return logger.withContext({
      category: "email",
      action: "email_service",
      actor_type: "system",
    });
  }

  /**
   * fromフィールドを構築する
   * 優先順位: template.fromName + template.fromEmail > デフォルト値
   */
  private buildFromField(template: EmailTemplate): string {
    // 1. template.fromNameとtemplate.fromEmailが指定されている場合
    if (template.fromName && template.fromEmail) {
      return `${template.fromName} <${template.fromEmail}>`;
    }

    // 2. template.fromNameのみ指定されている場合
    if (template.fromName) {
      return `${template.fromName} <${this.fromEmail}>`;
    }

    // 3. template.fromEmailのみ指定されている場合
    if (template.fromEmail) {
      return `${this.fromName} <${template.fromEmail}>`;
    }

    // 4. デフォルト値を使用
    return `${this.fromName} <${this.fromEmail}>`;
  }

  /**
   * メール送信（HTML/TEXTテンプレート使用）
   * リトライロジック付き
   */
  async sendEmail(params: {
    to: string;
    template: EmailTemplate;
    idempotencyKey?: string;
  }): Promise<NotificationResult> {
    const { to, template } = params;
    const idempotencyKey = params.idempotencyKey ?? randomUUID();

    // ログ用にマスクされたメールアドレス
    const maskedTo = maskEmail(to);

    // fromフィールドの構築
    const fromField = this.buildFromField(template);

    // 開発・テスト環境では実際の送信をスキップ
    const isDev = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
    if (isDev) {
      this.logger.info("Email send skipped in development/test environment", {
        to: maskedTo,
        subject: template.subject,
        outcome: "success",
        mocked: true,
      });
      return okResult(undefined, {
        providerMessageId: `mock-${randomUUID()}`,
        retryCount: 0,
      });
    }

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        // タイムアウト付きでメール送信を実行
        const result = await this.sendEmailWithTimeout(
          {
            from: fromField,
            to: [to],
            subject: template.subject,
            html: template.html,
            text: template.text,
            ...(template.replyTo && { reply_to: template.replyTo }),
          },
          idempotencyKey
        );

        // result.errorがある場合
        if (result.error) {
          const errorInfo = classifyResendError(result.error);

          handleServerError("EMAIL_SENDING_FAILED", {
            category: "email",
            action: "email_service",
            actorType: "system",
            additionalData: {
              to: maskedTo,
              subject: template.subject,
              error_type: errorInfo.type,
              error_message: errorInfo.message,
              status_code: errorInfo.statusCode,
              error_name: errorInfo.name,
              attempt: attempt + 1,
              max_retries: MAX_RETRIES,
            },
          });

          // 恒久的エラーの場合はリトライしない
          if (errorInfo.type === "permanent") {
            return buildEmailErrorResult({
              message: errorInfo.message,
              errorType: "permanent",
              statusCode: errorInfo.statusCode,
              retryCount: attempt,
              retryAfterSeconds: result.retryAfterSeconds,
            });
          }

          // 一時的エラーで最後のリトライの場合
          if (attempt === MAX_RETRIES) {
            return buildEmailErrorResult({
              message: errorInfo.message,
              errorType: "transient",
              statusCode: errorInfo.statusCode,
              retryCount: attempt,
              retryAfterSeconds: result.retryAfterSeconds,
            });
          }

          // リトライ待機
          const delay = resolveRetryDelayMs({
            attempt,
            statusCode: errorInfo.statusCode,
            retryAfterSeconds: result.retryAfterSeconds,
          });

          this.logger.info("Retrying email send after delay", {
            to: maskedTo,
            attempt: attempt + 1,
            delay_ms: delay,
            retry_after_seconds: result.retryAfterSeconds,
            outcome: "success",
          });

          await sleep(delay);
          continue;
        }

        // 成功
        this.logger.info("Email sent successfully", {
          to: maskedTo,
          subject: template.subject,
          message_id: result.data?.id,
          attempt: attempt + 1,
          outcome: "success",
        });

        return okResult(undefined, {
          providerMessageId: result.data?.id,
          retryCount: attempt,
        });
      } catch (error) {
        const errorInfo = classifyResendError(error);

        handleServerError("EMAIL_SENDING_FAILED", {
          category: "email",
          action: "email_service",
          actorType: "system",
          additionalData: {
            to: maskedTo,
            subject: template.subject,
            error_type: errorInfo.type,
            error_name: error instanceof Error ? error.name : "Unknown",
            error_message: error instanceof Error ? error.message : String(error),
            status_code: errorInfo.statusCode,
            attempt: attempt + 1,
            max_retries: MAX_RETRIES,
          },
        });

        // 恒久的エラーの場合はリトライしない
        if (errorInfo.type === "permanent") {
          return buildEmailErrorResult({
            message: errorInfo.message,
            errorType: "permanent",
            statusCode: errorInfo.statusCode,
            retryCount: attempt,
          });
        }

        // 最後のリトライの場合
        if (attempt === MAX_RETRIES) {
          return buildEmailErrorResult({
            message: errorInfo.message,
            errorType: "transient",
            statusCode: errorInfo.statusCode,
            retryCount: attempt,
          });
        }

        // リトライ待機
        const delay = resolveRetryDelayMs({
          attempt,
          statusCode: errorInfo.statusCode,
        });

        this.logger.info("Retrying email send after error", {
          to: maskedTo,
          attempt: attempt + 1,
          delay_ms: delay,
          outcome: "success",
        });

        await sleep(delay);
      }
    }

    // ここには到達しないはずだが、念のため
    return buildEmailErrorResult({
      message: "メール送信中に予期しないエラーが発生しました",
      errorType: "transient",
      retryCount: MAX_RETRIES,
    });
  }

  /**
   * タイムアウト付きでメール送信を実行
   */
  private async sendEmailWithTimeout(
    payload: ResendSendPayload,
    idempotencyKey: string
  ): Promise<ResendApiResult> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeoutPromise = new Promise<ResendApiResult>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Email send timeout")), RESEND_TIMEOUT_MS);
      });

      return await Promise.race([this.sendEmailRequest(payload, idempotencyKey), timeoutPromise]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Resend SDKでメール送信リクエストを送る
   */
  private async sendEmailRequest(
    payload: ResendSendPayload,
    idempotencyKey: string
  ): Promise<ResendApiResult> {
    const { data, error, headers } = await this.resend.emails.send(
      {
        from: payload.from,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        ...(payload.reply_to && { replyTo: payload.reply_to }),
        ...(payload.headers && { headers: payload.headers }),
      },
      { idempotencyKey }
    );
    const retryAfterSeconds = parseRetryAfterSeconds(headers);

    return {
      data: data ? { id: data.id } : null,
      error: error
        ? {
            message: error.message,
            name: error.name,
            statusCode: error.statusCode ?? undefined,
          }
        : null,
      retryAfterSeconds,
    };
  }

  /**
   * 管理者向けアラートメール送信
   * 注意: このメソッドが失敗した場合、循環参照を避けるため追加のアラートは送信しません
   */
  async sendAdminAlert(params: {
    subject: string;
    message: string;
    details?: Record<string, unknown>;
    idempotencyKey?: string;
  }): Promise<NotificationResult> {
    try {
      const { subject, message, details, idempotencyKey } = params;

      const template = buildAdminAlertTemplate({
        subject,
        message,
        details,
      });

      const result = await this.sendEmail({
        to: this.adminEmail,
        template: {
          ...template,
          fromEmail: this.fromEmail,
          fromName: this.fromName,
        },
        idempotencyKey,
      });

      // 管理者アラート送信に失敗した場合は詳細をログに記録
      if (!result.success) {
        handleServerError("ADMIN_ALERT_FAILED", {
          category: "email",
          action: "sendAdminAlert",
          actorType: "system",
          additionalData: {
            subject,
            error: result.error.message,
            error_type: result.meta?.errorType,
            status_code: result.meta?.statusCode,
            retry_count: result.meta?.retryCount,
            admin_email: maskEmail(this.adminEmail),
          },
        });
      }

      return result;
    } catch (error) {
      // テンプレート読み込みエラーなど、sendEmail以外でのエラー
      handleServerError("ADMIN_ALERT_FAILED", {
        category: "email",
        action: "sendAdminAlert",
        actorType: "system",
        additionalData: {
          error_name: error instanceof Error ? error.name : "Unknown",
          error_message: error instanceof Error ? error.message : String(error),
          admin_email: maskEmail(this.adminEmail),
        },
      });
      return errResult(
        new AppError("ADMIN_ALERT_FAILED", {
          message: error instanceof Error ? error.message : "Unexpected admin alert error",
          userMessage: "管理者アラート送信中にエラーが発生しました",
          retryable: false,
        }),
        {
          errorType: "permanent",
        }
      );
    }
  }
}
