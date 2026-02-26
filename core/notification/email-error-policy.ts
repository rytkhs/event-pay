import { getFiniteNumberProp, getStringProp, isRecord } from "@core/utils/type-guards";

import type { EmailErrorInfo, EmailErrorType } from "./types";

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
  "restricted_api_key",
  "invalid_attachment",
  "security_error",
]);

const TRANSIENT_ERROR_NAMES = new Set<string>([
  "rate_limit_exceeded",
  "concurrent_idempotent_requests",
  "application_error",
  "internal_server_error",
]);

const TRANSIENT_ERROR_MESSAGE_PATTERNS = [
  "network",
  "timeout",
  "econnrefused",
  "enotfound",
  "etimedout",
  "fetch failed",
];

function resolveTypeFromErrorName(name: string): EmailErrorType | null {
  if (TRANSIENT_ERROR_NAMES.has(name)) {
    return "transient";
  }

  if (PERMANENT_ERROR_NAMES.has(name)) {
    return "permanent";
  }

  return null;
}

export function classifyEmailProviderError(error: unknown): EmailErrorInfo {
  if (isRecord(error)) {
    const statusCode = getFiniteNumberProp(error, "statusCode");
    const name = getStringProp(error, "name");
    const message = getStringProp(error, "message") ?? "不明なエラー";

    if (name) {
      const typeFromName = resolveTypeFromErrorName(name);
      if (typeFromName) {
        return { type: typeFromName, message, name, statusCode };
      }
    }

    if (typeof statusCode === "number") {
      if (statusCode >= 500 || statusCode === 429 || statusCode === 408) {
        return { type: "transient", message, name, statusCode };
      }

      if (statusCode >= 400 && statusCode < 500) {
        return { type: "permanent", message, name, statusCode };
      }

      return { type: "transient", message, name, statusCode };
    }

    if (!(error instanceof Error)) {
      const typeFromName = name ? resolveTypeFromErrorName(name) : null;
      return {
        type: typeFromName ?? "transient",
        message,
        name,
        statusCode,
      };
    }
  }

  if (error instanceof Error) {
    const lowerMessage = error.message.toLowerCase();

    if (TRANSIENT_ERROR_MESSAGE_PATTERNS.some((pattern) => lowerMessage.includes(pattern))) {
      return {
        type: "transient",
        message: "ネットワークエラー",
        name: error.name,
      };
    }

    return {
      type: "transient",
      message: error.message || "不明なエラー",
      name: error.name,
    };
  }

  return {
    type: "transient",
    message: String(error) || "不明なエラー",
  };
}
