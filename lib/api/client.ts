/**
 * フロントエンド用 API クライアント
 * RFC 7807 Problem Details 対応
 */

import { type ProblemDetails } from "@/lib/api/problem-details";

/**
 * API エラークラス
 */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly detail?: string,
    public readonly retryable: boolean = false,
    public readonly correlation_id?: string,
    public readonly validationErrors?: Array<{ field: string; code: string; message: string }>,
    public readonly status: number = 500
  ) {
    super(message);
    this.name = "ApiError";
  }

  /**
   * Problem Details から ApiError を作成
   */
  static fromProblemDetails(problem: ProblemDetails): ApiError {
    const validationErrors = problem.errors?.map(err => ({
      field: err.pointer.replace(/^\/(?:query|body)\//, ''),
      code: err.code,
      message: err.message,
    }));

    return new ApiError(
      problem.code,
      problem.detail,
      problem.detail,
      problem.retryable,
      problem.correlation_id,
      validationErrors,
      problem.status
    );
  }
}

/**
 * fetch のオプション
 */
export interface FetchOptions extends RequestInit {
  /** タイムアウト（ミリ秒） */
  timeout?: number;
  /** リトライ回数 */
  maxRetries?: number;
  /** リトライ間隔（ミリ秒） */
  retryDelay?: number;
}

/**
 * RFC 7807 Problem Details 対応の fetch ラッパー
 */
export class ApiClient {
  private baseUrl: string;
  private defaultOptions: RequestInit;

  constructor(baseUrl: string = "", defaultOptions: RequestInit = {}) {
    this.baseUrl = baseUrl;
    this.defaultOptions = {
      headers: {
        "Content-Type": "application/json",
        ...defaultOptions.headers,
      },
      ...defaultOptions,
    };
  }

  /**
   * API リクエストを実行
   */
  async request<T = unknown>(
    url: string,
    options: FetchOptions = {}
  ): Promise<T> {
    const {
      timeout = 30000,
      maxRetries = 0,
      retryDelay = 1000,
      ...fetchOptions
    } = options;

    const fullUrl = url.startsWith("http") ? url : `${this.baseUrl}${url}`;
    const requestOptions: RequestInit = {
      ...this.defaultOptions,
      ...fetchOptions,
      headers: {
        ...this.defaultOptions.headers,
        ...fetchOptions.headers,
      },
    };

    let lastError: ApiError | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(fullUrl, {
          ...requestOptions,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          // 成功レスポンス
          const contentType = response.headers.get("content-type");
          if (contentType?.includes("application/json")) {
            return await response.json();
          }
          return response as unknown as T;
        }

        // エラーレスポンスの処理
        const contentType = response.headers.get("content-type");

        if (contentType?.includes("application/problem+json")) {
          // RFC 7807 Problem Details
          const problem: ProblemDetails = await response.json();
          lastError = ApiError.fromProblemDetails(problem);
        } else if (contentType?.includes("application/json")) {
          // 非 Problem Details の JSON エラーは汎用エラーとして扱う
          const body = await response.json();
          const code = typeof body.code === "string" ? body.code : "HTTP_ERROR";
          const detail = typeof body.detail === "string" ? body.detail : undefined;
          const message =
            (typeof body.message === "string" ? body.message : undefined) ||
            detail ||
            `HTTP ${response.status}`;
          const retryable =
            typeof body.retryable === "boolean"
              ? body.retryable
              : response.status >= 500 || response.status === 429;

          lastError = new ApiError(
            code,
            message,
            detail,
            retryable,
            undefined,
            undefined,
            response.status
          );
        } else {
          // テキストエラー
          const text = await response.text();
          lastError = new ApiError(
            "HTTP_ERROR",
            text || `HTTP ${response.status}`,
            undefined,
            false,
            undefined,
            undefined,
            response.status
          );
        }

        // リトライ判定
        if (attempt < maxRetries && (lastError?.retryable || response.status >= 500)) {
          await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
          continue;
        }

        throw lastError || new ApiError("HTTP_ERROR", `HTTP ${response.status}`, undefined, false, undefined, undefined, response.status);

      } catch (error) {
        if (error instanceof ApiError) {
          lastError = error;
        } else if (error instanceof DOMException && error.name === "AbortError") {
          lastError = new ApiError(
            "TIMEOUT_ERROR",
            "リクエストがタイムアウトしました",
            `${timeout}ms でタイムアウト`,
            true
          );
        } else {
          lastError = new ApiError(
            "NETWORK_ERROR",
            "ネットワークエラーが発生しました",
            error instanceof Error ? error.message : String(error),
            true
          );
        }

        if (attempt < maxRetries && lastError.retryable) {
          await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
          continue;
        }

        throw lastError;
      }
    }

    throw lastError || new ApiError("UNKNOWN_ERROR", "予期しないエラーが発生しました");
  }

  /**
   * GET リクエスト
   */
  async get<T = unknown>(url: string, options: FetchOptions = {}): Promise<T> {
    return this.request<T>(url, { ...options, method: "GET" });
  }

  /**
   * POST リクエスト
   */
  async post<T = unknown>(url: string, data?: unknown, options: FetchOptions = {}): Promise<T> {
    return this.request<T>(url, {
      ...options,
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * PUT リクエスト
   */
  async put<T = unknown>(url: string, data?: unknown, options: FetchOptions = {}): Promise<T> {
    return this.request<T>(url, {
      ...options,
      method: "PUT",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  /**
   * DELETE リクエスト
   */
  async delete<T = unknown>(url: string, options: FetchOptions = {}): Promise<T> {
    return this.request<T>(url, { ...options, method: "DELETE" });
  }
}

/**
 * デフォルト API クライアント インスタンス
 */
export const apiClient = new ApiClient();

/**
 * 便利関数: API エラーかどうかを判定
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * 便利関数: レート制限エラーかどうかを判定
 */
export function isRateLimitError(error: unknown): boolean {
  return isApiError(error) && error.code === "RATE_LIMITED";
}

/**
 * 便利関数: バリデーションエラーかどうかを判定
 */
export function isValidationError(error: unknown): boolean {
  return isApiError(error) && error.code === "VALIDATION_ERROR" && !!error.validationErrors?.length;
}

/**
 * 便利関数: リトライ可能なエラーかどうかを判定
 */
export function isRetryableError(error: unknown): boolean {
  return isApiError(error) && error.retryable;
}
