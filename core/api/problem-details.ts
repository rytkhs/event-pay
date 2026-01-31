/**
 * RFC 7807 "Problem Details for HTTP APIs" 準拠のエラーハンドリング
 *
 * @see https://tools.ietf.org/rfc/rfc7807.txt
 * @see https://datatracker.ietf.org/doc/html/rfc7807
 *
 * @deprecated 新規実装では `@core/errors/adapters/http-adapter` の `respondWithCode` / `respondWithProblem` を使用してください。
 *             このモジュールは後方互換のために維持されています。
 */

import { NextResponse } from "next/server";

import { logger } from "@core/logging/app-logger";
import { handleServerError } from "@core/utils/error-handler.server";

import { generateCorrelationId } from "../errors/correlation-id";
import { ERROR_REGISTRY } from "../errors/registry";
import type { ErrorCode } from "../errors/types";

/**
 * RFC 7807 Problem Details の基本構造
 */
export interface ProblemDetails {
  /** 問題タイプの一意識別子（URI）- 機械可読 */
  type: string;
  /** 問題の短い、人間可読な要約 */
  title: string;
  /** HTTPステータスコード */
  status: number;
  /** 問題の詳細な説明（この特定のインスタンス向け） */
  detail: string;
  /** 問題が発生したリソースの識別子（URI） */
  instance: string;

  // EventPay 拡張フィールド
  /** 機械可読なエラーコード（内部処理用） */
  code: ErrorCode;
  /** リクエスト追跡ID */
  correlation_id: string;
  /** リトライ可能かどうか */
  retryable: boolean;
  /** バリデーションエラーの詳細（該当する場合） */
  errors?: ValidationError[];
  /** 参考ドキュメントURL（該当する場合） */
  docs_url?: string;
}

/**
 * バリデーションエラーの詳細
 */
export interface ValidationError {
  /** エラーが発生したフィールド・パラメータのポインタ */
  pointer: string;
  /** バリデーションエラーコード */
  code: string;
  /** エラーメッセージ */
  message: string;
}

/**
 * エラー作成時の設定オプション
 */
interface ProblemOptions {
  /** HTTPステータスコード（デフォルト: Registryから取得） */
  status?: number;
  /** 詳細メッセージ */
  detail?: string;
  /** リクエストパス（デフォルト: "/api/unknown"） */
  instance?: string;
  /** リトライ可能性（デフォルト: Registryから取得） */
  retryable?: boolean;
  /** バリデーションエラー詳細 */
  errors?: ValidationError[];
  /** 参考ドキュメントURL */
  docs_url?: string;
  /** カスタム相関ID（デフォルト: 自動生成） */
  correlation_id?: string;
  /** ログに出力するための追加コンテキスト */
  log_context?: Record<string, unknown>;
}

/**
 * RFC 7807 準拠の Problem Details オブジェクトを作成
 */
function createProblem(code: ErrorCode, options: ProblemOptions = {}): ProblemDetails {
  const errorDef = ERROR_REGISTRY[code];

  const correlationId =
    options.correlation_id || generateCorrelationId({ prefix: "req", length: 16 });
  const status = options.status || errorDef.httpStatus;
  const detail =
    options.detail ||
    errorDef.userMessage ||
    "予期せぬエラーが発生しました。しばらく時間をおいて再度お試しください。";

  const problem: ProblemDetails = {
    type: errorDef.typeUri,
    title: errorDef.message,
    status,
    detail,
    instance: options.instance || "/api/unknown",
    code,
    correlation_id: correlationId,
    retryable: options.retryable ?? errorDef.retryable,
  };

  if (options.errors) {
    problem.errors = options.errors;
  }

  if (options.docs_url) {
    problem.docs_url = options.docs_url;
  }

  // ログ出力（PII除外済みの想定）
  const logFields = {
    category: "system" as const,
    action: "api_error" as const,
    actor_type: "anonymous" as const,
    correlation_id: correlationId,
    request_id: correlationId,
    error_code: code,
    status_code: status,
    instance: problem.instance,
    retryable: problem.retryable,
    outcome: "failure" as const,
    ...options.log_context,
  };

  if (status === 429) {
    logger.warn(`API Error: ${code}`, logFields);
  } else {
    handleServerError(code, {
      category: "system",
      action: "api_error",
      actorType: "anonymous",
      additionalData: {
        ...logFields,
        detail,
      },
    });
  }

  return problem;
}

/**
 * Problem Details を含む NextResponse を作成
 */
export function createProblemResponse(
  code: ErrorCode,
  options: ProblemOptions = {}
): NextResponse<ProblemDetails> {
  const problem = createProblem(code, options);

  const response = NextResponse.json(problem, {
    status: problem.status,
    headers: {
      "Content-Type": "application/problem+json",
      "X-Correlation-ID": problem.correlation_id,
      // センシティブなエラー詳細の誤キャッシュ防止
      "Cache-Control": "no-store",
    },
  });

  // レート制限の場合は Retry-After ヘッダーをデフォルト付与（必要なら呼び出し側で上書き）
  if (problem.status === 429 && !response.headers.get("Retry-After")) {
    response.headers.set("Retry-After", "60");
  }

  // 認証エラーの場合は WWW-Authenticate ヘッダーを追加
  if (problem.status === 401) {
    response.headers.set("WWW-Authenticate", "Bearer");
  }

  return response;
}

// Re-export ErrorCode for backward compatibility
export type { ErrorCode };

/**
 * クエリパラメータのバリデーションエラー作成ヘルパー
 */
export function createQueryValidationError(
  param: string,
  code: string,
  message: string
): ValidationError {
  return {
    pointer: `/query/${param}`,
    code,
    message,
  };
}

/**
 * Server Actions用のProblem Detailsレスポンスヘルパー
 */
export const problem = {
  /**
   * バリデーションエラー (422)
   */
  validationError(options: { detail?: string; errors?: ValidationError[] } = {}) {
    return createProblem("VALIDATION_ERROR", {
      status: 422,
      detail: options.detail,
      errors: options.errors,
      retryable: false,
    });
  },

  /**
   * リソース競合エラー (409)
   */
  resourceConflict(options: { detail?: string } = {}) {
    return createProblem("RESOURCE_CONFLICT", {
      status: 409,
      detail: options.detail,
      retryable: true,
    });
  },

  /**
   * レート制限エラー (429)
   */
  rateLimited(options: { retryAfterSec?: number } = {}) {
    const problemObj = createProblem("RATE_LIMITED", {
      status: 429,
      retryable: true,
    });
    // retryAfterSecを追加フィールドとして返却（ヘッダー用）
    return {
      ...problemObj,
      retryAfterSec: options.retryAfterSec,
    };
  },

  /**
   * 内部エラー (500)
   */
  internalError(options: { detail?: string } = {}) {
    return createProblem("INTERNAL_ERROR", {
      status: 500,
      detail: options.detail,
      retryable: true,
    });
  },

  /**
   * 認証エラー (401)
   */
  unauthorized(options: { detail?: string } = {}) {
    return createProblem("UNAUTHORIZED", {
      status: 401,
      detail: options.detail,
      retryable: false,
    });
  },

  /**
   * 認可エラー (403)
   */
  forbidden(options: { detail?: string } = {}) {
    return createProblem("FORBIDDEN", {
      status: 403,
      detail: options.detail,
      retryable: false,
    });
  },

  /**
   * Not Found (404)
   */
  notFound(options: { detail?: string } = {}) {
    return createProblem("NOT_FOUND", {
      status: 404,
      detail: options.detail,
      retryable: false,
    });
  },
};
