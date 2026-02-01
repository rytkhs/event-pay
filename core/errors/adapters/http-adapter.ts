/**
 * HTTP Problem Details Adapter
 *
 * AppError を RFC 7807 Problem Details 形式に変換するアダプタ
 * @see https://tools.ietf.org/rfc/rfc7807.txt
 */

import "server-only";

import { NextResponse } from "next/server";

import { logger } from "@core/logging/app-logger";
import { handleServerError, type ErrorContext } from "@core/utils/error-handler.server";

import { AppError } from "../app-error";
import { generateCorrelationId } from "../correlation-id";
import { normalizeError } from "../normalize";
import type { ProblemDetails, ValidationError } from "../problem-details.types";
import { ERROR_REGISTRY } from "../registry";
import type { ErrorCode } from "../types";

/**
 * Problem Details 生成オプション
 */
export interface ProblemOptions {
  /** リクエストパス（デフォルト: "/api/unknown"） */
  instance?: string;
  /** カスタム相関ID（デフォルト: 自動生成） */
  correlationId?: string;
  /** 詳細メッセージ（AppError.userMessage より優先。ユーザー向けの説明文） */
  detail?: string;
  /** バリデーションエラー詳細 */
  errors?: ValidationError[];
  /** 参考ドキュメントURL */
  docsUrl?: string;
  /** HTTPステータスコード（デフォルト: Registryから取得） */
  status?: number;
  /** 追加のHTTPヘッダー */
  headers?: Record<string, string>;
  /** ログに出力するための追加コンテキスト */
  logContext?: ErrorContext;
}

/**
 * AppError を RFC 7807 Problem Details オブジェクトに変換
 */
export function toProblemDetails(error: AppError, options: ProblemOptions = {}): ProblemDetails {
  const correlationId =
    options.correlationId ||
    error.correlationId ||
    generateCorrelationId({ prefix: "req", length: 16 });
  const def = ERROR_REGISTRY[error.code];

  const problem: ProblemDetails = {
    type: error.typeUri,
    title: def.message,
    status: options.status || error.httpStatus,
    detail: options.detail || error.userMessage,
    instance: options.instance || "/api/unknown",
    code: error.code,
    correlation_id: correlationId,
    retryable: error.retryable,
  };

  if (options.errors) {
    problem.errors = options.errors;
  }

  if (options.docsUrl) {
    problem.docs_url = options.docsUrl;
  }

  // 開発環境のみ内部メッセージを含める
  if (process.env.NODE_ENV === "development") {
    problem.debug = error.message;
  }

  return problem;
}

/**
 * Problem Details を含む NextResponse を作成（ログ付き）
 */
function createProblemResponse(
  problem: ProblemDetails,
  error: AppError,
  options: { logContext?: ErrorContext; headers?: Record<string, string> } = {}
): NextResponse<ProblemDetails> {
  // logContext から category/action/actorType を取得（デフォルト値はフォールバック）
  const category = options.logContext?.category ?? "system";
  const action = options.logContext?.action ?? "api_error";
  const actorType = options.logContext?.actorType ?? "anonymous";

  // additionalData 用のログフィールド
  const additionalLogData = {
    correlation_id: problem.correlation_id,
    request_id: problem.correlation_id,
    error_code: problem.code,
    status_code: problem.status,
    instance: problem.instance,
    retryable: problem.retryable,
    detail: problem.detail,
    ...options.logContext?.additionalData,
  };

  if (problem.status === 429) {
    // Rate Limited はエラーではなくwarnで出力
    logger.warn(`API Error: ${problem.code}`, {
      category,
      action,
      actor_type: actorType,
      user_id: options.logContext?.userId,
      event_id: options.logContext?.eventId,
      outcome: options.logContext?.outcome ?? "failure",
      ...additionalLogData,
    });
  } else {
    // handleServerError に ErrorContext の正式フィールドを渡す
    handleServerError(error, {
      category,
      action,
      actorType,
      userId: options.logContext?.userId,
      eventId: options.logContext?.eventId,
      outcome: options.logContext?.outcome ?? "failure",
      severity: options.logContext?.severity,
      additionalData: additionalLogData,
    });
  }

  const response = NextResponse.json(problem, {
    status: problem.status,
    headers: {
      "Content-Type": "application/problem+json",
      "X-Correlation-ID": problem.correlation_id,
      // センシティブなエラー詳細の誤キャッシュ防止
      "Cache-Control": "no-store",
      ...options.headers,
    },
  });

  // レート制限の場合は Retry-After ヘッダーをデフォルト付与
  if (problem.status === 429 && !response.headers.get("Retry-After")) {
    response.headers.set("Retry-After", "60");
  }

  // 認証エラーの場合は WWW-Authenticate ヘッダーを追加
  if (problem.status === 401) {
    response.headers.set("WWW-Authenticate", "Bearer");
  }

  return response;
}

/**
 * unknown エラーを正規化し、Problem Details レスポンスを生成
 *
 * @param error 任意のエラー（AppError, Error, string, unknown）
 * @param options オプション
 * @returns NextResponse<ProblemDetails>
 */
export function respondWithProblem(
  error: unknown,
  options: ProblemOptions & { defaultCode?: ErrorCode } = {}
): NextResponse<ProblemDetails> {
  const appError = normalizeError(error, options.defaultCode || "INTERNAL_ERROR");
  const problem = toProblemDetails(appError, options);
  return createProblemResponse(problem, appError, {
    logContext: options.logContext,
    headers: options.headers,
  });
}

/**
 * ErrorCode から直接 Problem Details レスポンスを生成（簡易版）
 *
 * @param code エラーコード
 * @param options オプション
 * @returns NextResponse<ProblemDetails>
 */
export function respondWithCode(
  code: ErrorCode,
  options: ProblemOptions = {}
): NextResponse<ProblemDetails> {
  const appError = new AppError(code, {
    userMessage: options.detail,
    correlationId: options.correlationId,
  });
  const problem = toProblemDetails(appError, options);
  return createProblemResponse(problem, appError, {
    logContext: options.logContext,
    headers: options.headers,
  });
}

export { generateCorrelationId };
export type { ProblemDetails, ValidationError };
