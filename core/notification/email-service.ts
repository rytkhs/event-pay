/**
 * メール通知サービスの実装
 */

import { randomUUID } from "crypto";

import type { CreateEmailOptions, ErrorResponse } from "resend";
import { Resend } from "resend";

import { AppError, errResult, okResult } from "@core/errors";
import { logger } from "@core/logging/app-logger";
import { handleServerError } from "@core/utils/error-handler.server";
import { maskEmail } from "@core/utils/mask";
import { getFiniteNumberProp, getStringProp, isRecord } from "@core/utils/type-guards";

import { buildAdminAlertTemplate } from "./templates";
import {
  IEmailNotificationService,
  EmailTemplate,
  NotificationResult,
  ResendErrorInfo,
  ResendErrorType,
} from "./types";

// タイムアウト設定（ミリ秒）
const RESEND_TIMEOUT_MS = 10000;

// リトライ設定
const MAX_RETRIES = 1;
const INITIAL_RETRY_DELAY_MS = 1000;
const RATE_LIMIT_RETRY_DELAY_MS = 5000;
const RETRY_JITTER_RATIO = 0.2;

/**
 * 恒久的（再試行しても解決しない）エラーの名前セット
 * statusCode が取れない場合の補助として利用（主軸は statusCode）
 */
const PERMANENT_ERROR_NAMES = new Set<string>([
  "missing_required_field",
  "invalid_idempotency_key",
  "invalid_idempotent_request",
  "invalid_access",
  "invalid_parameter",
  "invalid_region",
  "monthly_quota_exceeded",
  "daily_quota_exceeded",
  "missing_api_key",
  "invalid_api_key",
  "invalid_from_address",
  "validation_error",
  "not_found",
  "method_not_allowed",
]);

function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development";
}

/**
 * Resendエラーを分類する（statusCode 主軸 + name 補助）
 */
function classifyResendError(error: unknown): ResendErrorInfo {
  // 1) statusCode を持つ Resend 系エラーは最優先で解釈（主軸）
  if (isRecord(error)) {
    const statusCode = getFiniteNumberProp(error, "statusCode");
    const name = getStringProp(error, "name");
    const message = getStringProp(error, "message") ?? "不明なエラー";

    if (typeof statusCode === "number") {
      // 一時的（再試行対象）
      if (statusCode >= 500 || statusCode === 429 || statusCode === 408) {
        return { type: "transient", message, name, statusCode };
      }

      // 4xx は基本恒久的（429/408除く）
      if (statusCode >= 400 && statusCode < 500) {
        return { type: "permanent", message, name, statusCode };
      }

      // 想定外のstatusでも安全側に倒す
      return { type: "transient", message, name, statusCode };
    }
  }

  // 2) ネイティブ Error（ネットワーク障害、タイムアウト等）
  if (error instanceof Error) {
    const lowerMessage = error.message.toLowerCase();

    if (
      lowerMessage.includes("network") ||
      lowerMessage.includes("timeout") ||
      lowerMessage.includes("econnrefused") ||
      lowerMessage.includes("enotfound") ||
      lowerMessage.includes("etimedout") ||
      lowerMessage.includes("fetch failed")
    ) {
      return {
        type: "transient",
        message: "ネットワークエラー",
        name: error.name,
      };
    }

    // statusCode がない Error は安全側（transient）
    return {
      type: "transient",
      message: error.message || "不明なエラー",
      name: error.name,
    };
  }

  // 3) statusCode はないが name/message があるオブジェクト（補助）
  if (isRecord(error)) {
    const name = getStringProp(error, "name");
    const message = getStringProp(error, "message");

    if (name && message) {
      const type: ResendErrorType = PERMANENT_ERROR_NAMES.has(name) ? "permanent" : "transient";
      return { type, message, name };
    }
  }

  // 4) fallback（安全側）
  return {
    type: "transient",
    message: String(error) || "不明なエラー",
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
}): NotificationResult {
  const appError = new AppError("EMAIL_SENDING_FAILED", {
    message: options.message,
    userMessage: "メール送信に失敗しました",
    retryable: options.errorType === "transient",
  });

  return errResult(appError, {
    errorType: options.errorType,
    retryCount: options.retryCount,
  });
}

function resolveRetryDelayMs(options: {
  attempt: number;
  statusCode?: number;
  errorName?: string;
}): number {
  const withJitter = (baseDelayMs: number): number => {
    // +-20% のゆらぎを入れて同時リトライを分散させる
    const jitterFactor = 1 + (Math.random() * 2 - 1) * RETRY_JITTER_RATIO;
    return Math.max(0, Math.round(baseDelayMs * jitterFactor));
  };

  // rate limit は statusCode を優先、name は補助
  if (options.statusCode === 429 || options.errorName === "rate_limit_exceeded") {
    return withJitter(RATE_LIMIT_RETRY_DELAY_MS);
  }

  return withJitter(INITIAL_RETRY_DELAY_MS * Math.pow(2, options.attempt));
}

function resolveEnvValue(options: {
  value: string | undefined;
  envName: "FROM_EMAIL" | "FROM_NAME" | "ADMIN_EMAIL";
  defaultValue: string;
}): string {
  if (options.value) {
    return options.value;
  }

  logger.warn(`${options.envName} not set, using default`, {
    category: "email",
    action: "email_config_validation",
    default_value: options.defaultValue,
    outcome: "success",
  });

  return options.defaultValue;
}

/**
 * 環境変数をバリデーション
 */
function validateEmailConfig(): { fromEmail: string; fromName: string; adminEmail: string } {
  const isDev = isDevelopment();

  const fromEmail = process.env.FROM_EMAIL;
  const fromName = process.env.FROM_NAME;
  const adminEmail = process.env.ADMIN_EMAIL;

  // 本番環境（development以外）では必須
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

  return {
    fromEmail: resolveEnvValue({
      value: fromEmail,
      envName: "FROM_EMAIL",
      defaultValue: "noreply@eventpay.jp",
    }),
    fromName: resolveEnvValue({
      value: fromName,
      envName: "FROM_NAME",
      defaultValue: "みんなの集金",
    }),
    adminEmail: resolveEnvValue({
      value: adminEmail,
      envName: "ADMIN_EMAIL",
      defaultValue: "admin@eventpay.jp",
    }),
  };
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
    const isDev = isDevelopment();
    const apiKey = process.env.RESEND_API_KEY;
    if (!isDev && !apiKey) {
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
    const fromName = template.fromName || this.fromName;
    const fromEmail = template.fromEmail || this.fromEmail;
    return `${fromName} <${fromEmail}>`;
  }

  private logSendFailure(options: {
    maskedTo: string;
    subject: string;
    attempt: number;
    errorInfo: ResendErrorInfo;
  }): void {
    handleServerError("EMAIL_SENDING_FAILED", {
      category: "email",
      action: "email_service",
      actorType: "system",
      additionalData: {
        to: options.maskedTo,
        subject: options.subject,
        error_type: options.errorInfo.type,
        error_message: options.errorInfo.message,
        error_name: options.errorInfo.name,
        status_code: options.errorInfo.statusCode,
        attempt: options.attempt + 1,
        max_retries: MAX_RETRIES,
      },
    });
  }

  private completeIfNoMoreRetries(options: {
    errorInfo: ResendErrorInfo;
    attempt: number;
    maskedTo: string;
    subject: string;
  }): NotificationResult | null {
    const shouldRetry = options.errorInfo.type === "transient" && options.attempt < MAX_RETRIES;
    if (shouldRetry) {
      return null;
    }

    this.logSendFailure({
      maskedTo: options.maskedTo,
      subject: options.subject,
      attempt: options.attempt,
      errorInfo: options.errorInfo,
    });

    return buildEmailErrorResult({
      message: options.errorInfo.message,
      errorType: options.errorInfo.type,
      retryCount: options.attempt,
    });
  }

  private async retryOrReturnFailure(options: {
    errorInfo: ResendErrorInfo;
    attempt: number;
    maskedTo: string;
    subject: string;
    retryLogMessage: string;
  }): Promise<NotificationResult | null> {
    const finalizedResult = this.completeIfNoMoreRetries({
      errorInfo: options.errorInfo,
      attempt: options.attempt,
      maskedTo: options.maskedTo,
      subject: options.subject,
    });
    if (finalizedResult) {
      return finalizedResult;
    }

    await this.waitBeforeRetry({
      attempt: options.attempt,
      maskedTo: options.maskedTo,
      statusCode: options.errorInfo.statusCode,
      errorName: options.errorInfo.name,
      logMessage: options.retryLogMessage,
    });
    return null;
  }

  private async waitBeforeRetry(options: {
    attempt: number;
    maskedTo: string;
    logMessage: string;
    statusCode?: number;
    errorName?: string;
  }): Promise<void> {
    const delay = resolveRetryDelayMs({
      attempt: options.attempt,
      statusCode: options.statusCode,
      errorName: options.errorName,
    });

    this.logger.info(options.logMessage, {
      to: options.maskedTo,
      attempt: options.attempt + 1,
      delay_ms: delay,
      outcome: "success",
    });

    await sleep(delay);
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

    // 開発環境（development）では実際の送信をスキップ
    const isDev = isDevelopment();
    if (isDev) {
      this.logger.info("Email send skipped in development environment", {
        to: maskedTo,
        subject: template.subject,
        outcome: "success",
        mocked: true,
      });
      return okResult(undefined, {
        skipped: true,
        providerMessageId: `mock-${randomUUID()}`,
        retryCount: 0,
      });
    }

    const emailPayload: CreateEmailOptions = {
      from: fromField,
      to: [to],
      subject: template.subject,
      html: template.html,
      text: template.text,
      ...(template.replyTo && { replyTo: template.replyTo }),
    };

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        // タイムアウト付きでメール送信を実行
        const { data, error } = await this.sendEmailWithTimeout(emailPayload, idempotencyKey);

        // error がある場合
        if (error) {
          const errorInfo = classifyResendError(error);
          const finalizedResult = await this.retryOrReturnFailure({
            errorInfo,
            attempt,
            maskedTo,
            subject: template.subject,
            retryLogMessage: "Retrying email send after delay",
          });
          if (finalizedResult) {
            return finalizedResult;
          }
          continue;
        }

        // error がなくても data.id がない場合は失敗として扱う
        if (!data?.id) {
          const errorInfo: ResendErrorInfo = {
            type: "transient",
            message: "Email provider returned success without message id",
          };

          const finalizedResult = await this.retryOrReturnFailure({
            errorInfo,
            attempt,
            maskedTo,
            subject: template.subject,
            retryLogMessage: "Retrying email send after invalid response",
          });
          if (finalizedResult) {
            return finalizedResult;
          }
          continue;
        }

        // 成功
        this.logger.info("Email sent successfully", {
          to: maskedTo,
          subject: template.subject,
          message_id: data.id,
          attempt: attempt + 1,
          outcome: "success",
        });

        return okResult(undefined, {
          providerMessageId: data.id,
          retryCount: attempt,
        });
      } catch (error) {
        const errorInfo = classifyResendError(error);
        const finalizedResult = await this.retryOrReturnFailure({
          errorInfo,
          attempt,
          maskedTo,
          subject: template.subject,
          retryLogMessage: "Retrying email send after error",
        });
        if (finalizedResult) {
          return finalizedResult;
        }
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
    payload: CreateEmailOptions,
    idempotencyKey: string
  ): Promise<{ data: { id: string } | null; error: ErrorResponse | null }> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Email send timeout")), RESEND_TIMEOUT_MS);
      });

      return await Promise.race([
        this.resend.emails.send(payload, { idempotencyKey }),
        timeoutPromise,
      ]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
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
            retry_count: result.meta?.retryCount,
            admin_email: maskEmail(this.adminEmail),
          },
        });
      }

      return result;
    } catch (error) {
      const errorInfo = classifyResendError(error);

      // テンプレート読み込みエラーなど、sendEmail以外でのエラー
      handleServerError("ADMIN_ALERT_FAILED", {
        category: "email",
        action: "sendAdminAlert",
        actorType: "system",
        additionalData: {
          error_type: errorInfo.type,
          error_name: errorInfo.name,
          error_message: errorInfo.message,
          status_code: errorInfo.statusCode,
          admin_email: maskEmail(this.adminEmail),
        },
      });

      return errResult(
        new AppError("ADMIN_ALERT_FAILED", {
          message: errorInfo.message || "Unexpected admin alert error",
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
