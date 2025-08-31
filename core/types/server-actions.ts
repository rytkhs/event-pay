/**
 * Server Actionsの共通レスポンス型定義
 * RFC 7807 Problem Details のコード体系と統合
 */

import { type ErrorCode as ProblemDetailsErrorCode } from "@core/api/problem-details";
import { randomBytes } from "crypto";

export interface ServerActionError {
  success: false;
  error: string;
  code: ProblemDetailsErrorCode;
  details?: Record<string, unknown>;
  correlationId?: string;
  retryable?: boolean;
  fieldErrors?: Array<{
    field: string;
    code: string;
    message: string;
  }>;
}

export type ServerActionResult<T = unknown> =
  | {
      success: true;
      data: T;
      message?: string;
    }
  | ServerActionError;

/**
 * Server Actions用エラーコード（Problem Details と統合）
 */
export type ErrorCode = ProblemDetailsErrorCode;

/**
 * 相関IDを生成
 */
function generateCorrelationId(): string {
  return `sa_${randomBytes(6).toString("hex")}`;
}

/**
 * Server Actions用エラーレスポンスを作成するヘルパー関数
 */
export function createServerActionError(
  code: ErrorCode,
  message: string,
  options: {
    details?: Record<string, unknown>;
    correlationId?: string;
    retryable?: boolean;
    fieldErrors?: Array<{
      field: string;
      code: string;
      message: string;
    }>;
  } = {}
): ServerActionError {
  return {
    success: false,
    error: message,
    code,
    correlationId: options.correlationId || generateCorrelationId(),
    retryable: options.retryable ?? false,
    details: options.details,
    fieldErrors: options.fieldErrors,
  };
}

/**
 * Server Actions用成功レスポンスを作成するヘルパー関数
 */
export function createServerActionSuccess<T>(data: T, message?: string): ServerActionResult<T> {
  return {
    success: true,
    data,
    message,
  };
}

/**
 * Zodエラーを Server Actions レスポンスに変換するヘルパー関数
 */
export function zodErrorToServerActionResponse(error: import("zod").ZodError): ServerActionError {
  const fieldErrors = error.errors.map((err) => ({
    field: err.path.join("."),
    code: err.code,
    message: err.message,
  }));

  const firstError = error.errors?.[0];
  return createServerActionError("VALIDATION_ERROR", firstError?.message || "入力値が無効です", {
    fieldErrors,
    details: { zodErrors: error.errors },
  });
}
