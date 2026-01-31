import type { ZodError } from "zod";

import { AppError } from "../app-error";
import { generateCorrelationId } from "../correlation-id";
import { normalizeError } from "../normalize";
import type { ErrorCode, ErrorContext } from "../types";

export type ActionFieldErrors = Record<string, string[]>;

export interface ActionError {
  code: ErrorCode;
  userMessage: string;
  correlationId: string;
  retryable: boolean;
  fieldErrors?: ActionFieldErrors;
  details?: ErrorContext;
}

export type ActionResult<T = unknown> =
  | {
      success: true;
      data?: T;
      message?: string;
      redirectUrl?: string;
      needsVerification?: boolean;
    }
  | {
      success: false;
      error: ActionError;
      redirectUrl?: string;
      needsVerification?: boolean;
    };

type ActionOkOptions = {
  message?: string;
  redirectUrl?: string;
  needsVerification?: boolean;
};

type ActionFailOptions = {
  /** ユーザー向け表示文言（内部エラーメッセージは入れない） */
  userMessage?: string;
  correlationId?: string;
  retryable?: boolean;
  fieldErrors?: ActionFieldErrors;
  details?: ErrorContext;
  redirectUrl?: string;
  needsVerification?: boolean;
};

type ActionFailFromOptions = ActionFailOptions & {
  defaultCode?: ErrorCode;
};

function coerceFieldErrors(details?: ErrorContext): ActionFieldErrors | undefined {
  if (!details) {
    return undefined;
  }
  const entries = Object.entries(details);
  if (entries.length === 0) {
    return undefined;
  }
  const fieldErrors: ActionFieldErrors = {};
  for (const [key, value] of entries) {
    if (typeof value === "string") {
      fieldErrors[key] = [value];
    } else if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
      fieldErrors[key] = value;
    }
  }
  return Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined;
}

function sanitizeDetails(details?: ErrorContext): ErrorContext | undefined {
  if (!details) {
    return undefined;
  }
  const entries = Object.entries(details);
  if (entries.length === 0) {
    return undefined;
  }
  const sanitized: ErrorContext = {};
  for (const [key, value] of entries) {
    if (value === null) {
      sanitized[key] = value;
      continue;
    }
    const valueType = typeof value;
    if (valueType === "string" || valueType === "number" || valueType === "boolean") {
      sanitized[key] = value;
      continue;
    }
    if (Array.isArray(value) && value.every((item) => item === null || typeof item === "string")) {
      sanitized[key] = value;
    }
  }
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

export function toActionError(
  appError: AppError,
  options: Pick<
    ActionFailOptions,
    "userMessage" | "correlationId" | "retryable" | "details" | "fieldErrors"
  > = {}
): ActionError {
  const correlationId =
    options.correlationId ??
    appError.correlationId ??
    generateCorrelationId({ prefix: "sa", length: 12 });
  const userMessage = options.userMessage ?? appError.userMessage;
  const retryable = options.retryable ?? appError.retryable;
  const mergedDetails = options.details
    ? { ...appError.details, ...options.details }
    : appError.details;
  const fieldErrors =
    options.fieldErrors ??
    (appError.code === "VALIDATION_ERROR" ? coerceFieldErrors(mergedDetails) : undefined);
  const sanitizedDetails = sanitizeDetails(mergedDetails);

  return {
    code: appError.code,
    userMessage,
    correlationId,
    retryable,
    fieldErrors,
    details: sanitizedDetails,
  };
}

export function ok<T>(data?: T, options: ActionOkOptions = {}): ActionResult<T> {
  return {
    success: true,
    data,
    message: options.message,
    redirectUrl: options.redirectUrl,
    needsVerification: options.needsVerification,
  };
}

export function fail(code: ErrorCode, options: ActionFailOptions = {}): ActionResult<never> {
  const appError = new AppError(code, {
    userMessage: options.userMessage,
    correlationId: options.correlationId,
    retryable: options.retryable,
    details: options.details,
  });

  return {
    success: false,
    error: toActionError(appError, options),
    redirectUrl: options.redirectUrl,
    needsVerification: options.needsVerification,
  };
}

export function failFrom(error: unknown, options: ActionFailFromOptions = {}): ActionResult<never> {
  const appError = normalizeError(error, options.defaultCode ?? "INTERNAL_ERROR");
  return {
    success: false,
    error: toActionError(appError, options),
    redirectUrl: options.redirectUrl,
    needsVerification: options.needsVerification,
  };
}

export function zodFail(
  error: ZodError,
  options: Omit<ActionFailFromOptions, "defaultCode"> = {}
): ActionResult<never> {
  const { fieldErrors: rawFieldErrors, formErrors } = error.flatten();
  const fieldErrors: ActionFieldErrors = {};
  for (const [key, messages] of Object.entries(rawFieldErrors)) {
    if (messages && messages.length > 0) {
      fieldErrors[key] = messages;
    }
  }
  if (formErrors.length > 0) {
    fieldErrors._form = formErrors;
  }
  return fail("VALIDATION_ERROR", {
    ...options,
    fieldErrors: Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined,
    retryable: false,
  });
}
