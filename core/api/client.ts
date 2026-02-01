/**
 * フロントエンド用 API クライアント
 * RFC 7807 Problem Details 対応
 */

import { type ProblemDetails } from "@core/errors/problem-details.types";

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
    const validationErrors = problem.errors?.map((err) => ({
      field: err.pointer.replace(/^\/(?:query|body)(?:\/|$)/, ""),
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
  /**
   * 成功時のレスポンス処理方法（デフォルト: 'json'）
   * 'json' を指定した場合に JSON 以外が返ると ApiError を投げます
   */
  responseType?: "json" | "text" | "blob" | "arrayBuffer" | "response";
}

/**
 * RFC 7807 Problem Details 対応の fetch ラッパー
 */
class ApiClient {
  private baseUrl: string;
  private defaultOptions: RequestInit;

  constructor(baseUrl: string = "", defaultOptions: RequestInit = {}) {
    this.baseUrl = baseUrl;
    this.defaultOptions = {
      headers: {
        Accept: "application/json",
        ...defaultOptions.headers,
      },
      credentials: "same-origin",
      ...defaultOptions,
    };
  }

  /**
   * API リクエストを実行
   */
  // オーバーロード: responseType によって返り値の型を分岐
  async request<T = unknown>(
    url: string,
    options?: FetchOptions & { responseType?: "json" | undefined }
  ): Promise<T>;
  async request(url: string, options: FetchOptions & { responseType: "text" }): Promise<string>;
  async request(url: string, options: FetchOptions & { responseType: "blob" }): Promise<Blob>;
  async request(
    url: string,
    options: FetchOptions & { responseType: "arrayBuffer" }
  ): Promise<ArrayBuffer>;
  async request(
    url: string,
    options: FetchOptions & { responseType: "response" }
  ): Promise<Response>;
  async request<T = unknown>(
    url: string,
    options: FetchOptions = {}
  ): Promise<T | string | Blob | ArrayBuffer | Response> {
    const {
      timeout = 30000,
      maxRetries = 0,
      retryDelay = 1000,
      responseType = "json",
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

        // 外部のAbortSignalがある場合は合成（外部signal中断時は内部も中断）
        const externalSignal = fetchOptions.signal;
        const combinedSignal = controller.signal;

        if (externalSignal) {
          // 外部signalが既に中断済みなら即座に中断
          if (externalSignal.aborted) {
            controller.abort();
          } else {
            // 外部signalの中断を監視し、内部controllerも中断
            const abortHandler = () => controller.abort();
            externalSignal.addEventListener("abort", abortHandler, { once: true });

            // クリーンアップのためにタイムアウト時にリスナーを削除
            const originalAbort = controller.abort.bind(controller);
            controller.abort = () => {
              externalSignal.removeEventListener("abort", abortHandler);
              originalAbort();
            };
          }
        }

        const response = await fetch(fullUrl, {
          ...requestOptions,
          signal: combinedSignal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          // 成功レスポンス処理
          const contentType = response.headers.get("content-type") || "";
          const statusNoContent = response.status === 204 || response.status === 205;

          // レスポンスボディが空かどうか（Content-Length: 0 などにも対応）
          const hasBody = !statusNoContent && response.headers.get("content-length") !== "0";

          switch (responseType) {
            case "response":
              return response;
            case "text":
              return hasBody ? await response.text() : "";
            case "blob":
              return hasBody ? await response.blob() : new Blob([]);
            case "arrayBuffer":
              return hasBody ? await response.arrayBuffer() : new ArrayBuffer(0);
            case "json":
            default: {
              if (!hasBody) {
                // No Content の場合は undefined を返して呼び出し側で扱う
                return undefined as unknown as T;
              }
              if (contentType.includes("application/json")) {
                return await response.json();
              }
              // JSON 期待だが JSON ではない
              throw new ApiError(
                "UNEXPECTED_CONTENT_TYPE",
                `期待した content-type: application/json, 実際: ${contentType || "unknown"}`,
                undefined,
                false,
                undefined,
                undefined,
                response.status
              );
            }
          }
        }

        // エラーレスポンスの処理
        const contentType = response.headers.get("content-type");

        if (contentType?.includes("application/problem+json")) {
          // RFC 7807 Problem Details
          const problem: ProblemDetails = await response.json();
          lastError = ApiError.fromProblemDetails(problem);
        } else if (contentType?.includes("application/json")) {
          // 非 Problem Details の JSON エラーは汎用エラーとして扱う
          const body = (await response.json()) as Record<string, unknown>;
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
          await new Promise((resolve) => setTimeout(resolve, retryDelay * (attempt + 1)));
          continue;
        }

        throw (
          lastError ||
          new ApiError(
            "HTTP_ERROR",
            `HTTP ${response.status}`,
            undefined,
            false,
            undefined,
            undefined,
            response.status
          )
        );
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
          await new Promise((resolve) => setTimeout(resolve, retryDelay * (attempt + 1)));
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
    return this.request<T>(url, { ...options, method: "GET", responseType: "json" as const });
  }

  /**
   * POST リクエスト
   */
  async post<T = unknown>(url: string, data?: unknown, options: FetchOptions = {}): Promise<T> {
    const body = data ? JSON.stringify(data) : undefined;
    const headers = {
      ...options.headers,
      ...(body ? { "Content-Type": "application/json" } : {}),
    } as HeadersInit;
    return this.request<T>(url, {
      ...options,
      method: "POST",
      headers,
      body,
      responseType: "json" as const,
    });
  }

  /**
   * PUT リクエスト
   */
  async put<T = unknown>(url: string, data?: unknown, options: FetchOptions = {}): Promise<T> {
    const body = data ? JSON.stringify(data) : undefined;
    const headers = {
      ...options.headers,
      ...(body ? { "Content-Type": "application/json" } : {}),
    } as HeadersInit;
    return this.request<T>(url, {
      ...options,
      method: "PUT",
      headers,
      body,
      responseType: "json" as const,
    });
  }

  /**
   * DELETE リクエスト
   */
  async delete<T = unknown>(url: string, options: FetchOptions = {}): Promise<T> {
    return this.request<T>(url, { ...options, method: "DELETE", responseType: "json" as const });
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
 * 便利関数: リトライ可能なエラーかどうかを判定
 */
export function isRetryableError(error: unknown): boolean {
  return isApiError(error) && error.retryable;
}
