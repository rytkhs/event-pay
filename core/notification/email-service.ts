/**
 * メール通知サービスの実装
 */

import { randomUUID } from "crypto";

import type { CreateEmailOptions, CreateEmailRequestOptions, ErrorResponse } from "resend";
import { Resend } from "resend";

import { AppError, errResult, okResult } from "@core/errors";
import { logger } from "@core/logging/app-logger";
import { handleServerError } from "@core/utils/error-handler.server";
import { maskEmail } from "@core/utils/mask";

import { resolveEmailConfig } from "./email-config";
import { classifyEmailProviderError } from "./email-error-policy";
import { computeRetryDelayMs, DEFAULT_MAX_ATTEMPTS, shouldRetry } from "./email-retry-policy";
import { buildAdminAlertTemplate } from "./templates";
import {
  IEmailNotificationService,
  EmailTemplate,
  NotificationResult,
  EmailErrorInfo,
  EmailErrorType,
} from "./types";

// タイムアウト設定（ミリ秒）
const RESEND_TIMEOUT_MS = 10000;

function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development";
}

/**
 * 指数バックオフでスリープ
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildEmailErrorResult(options: {
  message: string;
  errorType: EmailErrorType;
  retryCount: number;
  statusCode?: number;
  providerErrorName?: string;
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
    providerErrorName: options.providerErrorName,
  });
}

type ResendSendResult = {
  data: { id: string } | null;
  error: ErrorResponse | null;
  headers: Record<string, string> | null;
};

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

    const config = resolveEmailConfig();
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
    errorInfo: EmailErrorInfo;
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
        attempt: options.attempt,
        max_attempts: DEFAULT_MAX_ATTEMPTS,
      },
    });
  }

  private async waitBeforeRetry(options: {
    attempt: number;
    maskedTo: string;
    logMessage: string;
    statusCode?: number;
    errorName?: string;
    retryAfterSeconds?: number;
  }): Promise<void> {
    const delay = computeRetryDelayMs({
      attempt: options.attempt - 1,
      statusCode: options.statusCode,
      errorName: options.errorName,
      retryAfterSeconds: options.retryAfterSeconds,
    });

    this.logger.info(options.logMessage, {
      to: options.maskedTo,
      attempt: options.attempt,
      delay_ms: delay,
      status: "retrying",
    });

    await sleep(delay);
  }

  private async handleSendFailure(options: {
    errorInfo: EmailErrorInfo;
    attempt: number;
    maskedTo: string;
    subject: string;
    retryLogMessage: string;
    retryAfterSeconds?: number;
  }): Promise<NotificationResult | null> {
    const retryable = shouldRetry({
      errorInfo: options.errorInfo,
      attempt: options.attempt,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
    });

    if (!retryable) {
      this.logSendFailure({
        maskedTo: options.maskedTo,
        subject: options.subject,
        attempt: options.attempt,
        errorInfo: options.errorInfo,
      });

      return buildEmailErrorResult({
        message: options.errorInfo.message,
        errorType: options.errorInfo.type,
        retryCount: options.attempt - 1,
        statusCode: options.errorInfo.statusCode,
        providerErrorName: options.errorInfo.name,
      });
    }

    await this.waitBeforeRetry({
      attempt: options.attempt,
      maskedTo: options.maskedTo,
      statusCode: options.errorInfo.statusCode,
      errorName: options.errorInfo.name,
      retryAfterSeconds: options.retryAfterSeconds,
      logMessage: options.retryLogMessage,
    });

    return null;
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

    const maskedTo = maskEmail(to);
    const fromField = this.buildFromField(template);

    if (isDevelopment()) {
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

    for (let attempt = 1; attempt <= DEFAULT_MAX_ATTEMPTS; attempt++) {
      let sendResult: ResendSendResult;

      try {
        sendResult = await this.sendEmailWithTimeout(emailPayload, idempotencyKey);
      } catch (error) {
        const finalResult = await this.handleSendFailure({
          errorInfo: classifyEmailProviderError(error),
          attempt,
          maskedTo,
          subject: template.subject,
          retryLogMessage: "Retrying email send after error",
        });

        if (finalResult) {
          return finalResult;
        }

        continue;
      }

      if (sendResult.error) {
        const finalResult = await this.handleSendFailure({
          errorInfo: classifyEmailProviderError(sendResult.error),
          attempt,
          maskedTo,
          subject: template.subject,
          retryLogMessage: "Retrying email send after delay",
          retryAfterSeconds: this.extractRetryAfterSeconds(sendResult.headers),
        });

        if (finalResult) {
          return finalResult;
        }

        continue;
      }

      if (!sendResult.data?.id) {
        const finalResult = await this.handleSendFailure({
          errorInfo: {
            type: "transient",
            message: "Email provider returned success without message id",
          },
          attempt,
          maskedTo,
          subject: template.subject,
          retryLogMessage: "Retrying email send after invalid response",
        });
        if (finalResult) {
          return finalResult;
        }
        continue;
      }

      this.logger.info("Email sent successfully", {
        to: maskedTo,
        subject: template.subject,
        message_id: sendResult.data.id,
        attempt: attempt,
        outcome: "success",
      });

      return okResult(undefined, {
        providerMessageId: sendResult.data.id,
        retryCount: attempt - 1,
      });
    }

    return buildEmailErrorResult({
      message: "メール送信中に予期しないエラーが発生しました",
      errorType: "transient",
      retryCount: DEFAULT_MAX_ATTEMPTS - 1,
      statusCode: undefined,
      providerErrorName: undefined,
    });
  }

  /**
   * タイムアウト付きでメール送信を実行
   */
  private async sendEmailWithTimeout(
    payload: CreateEmailOptions,
    idempotencyKey: string
  ): Promise<ResendSendResult> {
    const abortController = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          abortController.abort();
          reject(new Error("Email send timeout"));
        }, RESEND_TIMEOUT_MS);
      });

      // resend@6.9.2 では `signal` とは型付けされないが、実行時に `options` がfetch optionに展開される
      const requestOptions: CreateEmailRequestOptions & { signal: AbortSignal } = {
        idempotencyKey,
        signal: abortController.signal,
      };

      return await Promise.race([this.resend.emails.send(payload, requestOptions), timeoutPromise]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  private extractRetryAfterSeconds(
    headers: Record<string, string> | null | undefined
  ): number | undefined {
    if (!headers) {
      return undefined;
    }

    const rawRetryAfter = headers["retry-after"] ?? headers["Retry-After"];
    if (!rawRetryAfter) {
      return undefined;
    }

    const retryAfterSeconds = Number.parseInt(rawRetryAfter, 10);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
      return retryAfterSeconds;
    }

    const retryAfterDateMs = Date.parse(rawRetryAfter);
    if (!Number.isFinite(retryAfterDateMs)) {
      return undefined;
    }

    return Math.max(1, Math.ceil((retryAfterDateMs - Date.now()) / 1000));
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
      const errorInfo = classifyEmailProviderError(error);

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
