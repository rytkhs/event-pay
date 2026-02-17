import { AppError, errResult, type ErrorCode } from "@core/errors";

import type { WebhookProcessingMeta, WebhookProcessingResult } from "../types";

import { isTerminalDatabaseError, type WebhookDatabaseErrorLike } from "./webhook-db-error";

interface CreateWebhookDbErrorParams {
  code: ErrorCode;
  reason: string;
  eventId: string;
  userMessage: string;
  dbError: WebhookDatabaseErrorLike & { message: string };
  details: Record<string, unknown>;
  paymentId?: string;
  terminalOverride?: boolean;
}

interface CreateWebhookUnexpectedErrorParams {
  eventId: string;
  reason: string;
  error: unknown;
  eventType?: string;
  userMessage?: string;
}

interface CreateWebhookInvalidPayloadErrorParams {
  code: ErrorCode;
  reason: string;
  eventId: string;
  userMessage: string;
  message: string;
  details: Record<string, unknown>;
  paymentId?: string;
}

function buildMeta(
  base: Omit<WebhookProcessingMeta, "errorCode">,
  errorCode?: string | null
): WebhookProcessingMeta {
  if (typeof errorCode === "string" && errorCode.length > 0) {
    return {
      ...base,
      errorCode,
    };
  }

  return base;
}

export function createWebhookDbError({
  code,
  reason,
  eventId,
  paymentId,
  userMessage,
  dbError,
  details,
  terminalOverride,
}: CreateWebhookDbErrorParams): WebhookProcessingResult {
  const terminal =
    typeof terminalOverride === "boolean" ? terminalOverride : isTerminalDatabaseError(dbError);

  return errResult(
    new AppError(code, {
      message: dbError.message,
      userMessage,
      retryable: !terminal,
      details: {
        ...details,
        errorCode: dbError.code,
      },
    }),
    buildMeta(
      {
        terminal,
        reason,
        eventId,
        paymentId,
      },
      dbError.code
    )
  );
}

export function createWebhookUnexpectedError({
  eventId,
  reason,
  error,
  eventType,
  userMessage = "Webhook処理に失敗しました",
}: CreateWebhookUnexpectedErrorParams): WebhookProcessingResult {
  const message = error instanceof Error ? error.message : "Unknown error occurred";

  return errResult(
    new AppError("WEBHOOK_UNEXPECTED_ERROR", {
      message,
      userMessage,
      retryable: true,
      details: {
        eventId,
        eventType,
      },
    }),
    {
      reason,
      eventId,
      errorCode: "WEBHOOK_UNEXPECTED_ERROR",
    }
  );
}

export function createWebhookInvalidPayloadError({
  code,
  reason,
  eventId,
  paymentId,
  userMessage,
  message,
  details,
}: CreateWebhookInvalidPayloadErrorParams): WebhookProcessingResult {
  return errResult(
    new AppError(code, {
      message,
      userMessage,
      retryable: false,
      details,
    }),
    {
      terminal: true,
      reason,
      eventId,
      paymentId,
      errorCode: code,
    }
  );
}
