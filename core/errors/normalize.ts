import { ZodError } from "zod";

import { ApiError } from "@core/api/client";

import { AppError } from "./app-error";
import { isErrorCode } from "./guards";
import type { ErrorCode } from "./types";

type ProblemDetailsLike = {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  code?: string;
  correlation_id?: string;
  retryable?: boolean;
  errors?: unknown;
};

function isProblemDetailsLike(value: unknown): value is ProblemDetailsLike {
  if (!value || typeof value !== "object") {
    return false;
  }
  const anyValue = value as Record<string, unknown>;
  const hasType = typeof anyValue.type === "string";
  const hasStatus = typeof anyValue.status === "number";
  const hasDetail = typeof anyValue.detail === "string";
  const hasCode = typeof anyValue.code === "string";
  return (hasType && hasStatus && hasDetail) || (hasDetail && hasCode);
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const anyError = error as { name?: unknown };
  return anyError.name === "AbortError";
}

function isFetchTypeError(error: unknown): error is TypeError {
  return error instanceof TypeError && error.message.includes("fetch");
}

/**
 * 任意のエラーを正規化して AppError に変換する
 * @param error 未知のエラーオブジェクト
 * @param defaultCode エラーコードが特定できない場合のデフォルトコード
 */
export function normalizeError(
  error: unknown,
  defaultCode: ErrorCode = "INTERNAL_ERROR"
): AppError {
  // 既に AppError の場合はそのまま返す
  if (error instanceof AppError) {
    return error;
  }

  if (isAbortError(error)) {
    return new AppError("TIMEOUT_ERROR", {
      message: "Request was aborted",
      cause: error,
    });
  }

  if (isFetchTypeError(error)) {
    return new AppError("NETWORK_ERROR", {
      message: error.message,
      cause: error,
    });
  }

  if (error instanceof ApiError) {
    const code = isErrorCode(error.code) ? error.code : defaultCode;
    return new AppError(code, {
      message: error.message,
      userMessage: error.detail,
      retryable: error.retryable,
      correlationId: error.correlation_id,
      details: {
        status: error.status,
        detail: error.detail,
        validationErrors: error.validationErrors,
        source: "api",
      },
      cause: error,
    });
  }

  if (isProblemDetailsLike(error)) {
    const code = error.code && isErrorCode(error.code) ? error.code : defaultCode;
    const retryable =
      typeof error.retryable === "boolean"
        ? error.retryable
        : typeof error.status === "number"
          ? error.status >= 500 || error.status === 429
          : undefined;
    return new AppError(code, {
      message: error.detail || error.title || "Problem details error",
      userMessage: error.detail,
      retryable,
      correlationId: error.correlation_id,
      details: {
        status: error.status,
        type: error.type,
        instance: error.instance,
        errors: error.errors,
        source: "problem-details",
      },
      cause: error,
    });
  }

  // Zod エラー (バリデーション)
  if (error instanceof ZodError) {
    const fieldErrors = error.flatten().fieldErrors;
    const details = Object.entries(fieldErrors).reduce(
      (acc, [key, msgs]) => ({
        ...acc,
        [key]: msgs?.[0] || "Invalid value",
      }),
      {}
    );

    return new AppError("VALIDATION_ERROR", {
      message: "Validation failed",
      cause: error,
      details,
    });
  }

  // Next.js の Digest エラーなどはそのまま扱うのが難しいが、
  // 一般的な Error オブジェクトであればメッセージを継承する
  if (error instanceof Error) {
    // Next.js のリダイレクト例外などはエラーとして扱わないケースもあるが、
    // ここでキャッチされたということはエラーとして処理すべき文脈
    // (DIGESTなどは別途除外ロジックが必要かもしれないが、一旦汎用エラーとして扱う)

    // Stripeなどの既知のエラーパターンがあればここで分岐可能ですが、
    // 依存関係を避けるため、「エラーメッセージに特定の文字列が含まれるか」等で簡易判定する場合も

    return new AppError(defaultCode, {
      message: error.message,
      cause: error,
    });
  }

  // 文字列の場合
  if (typeof error === "string") {
    if (isErrorCode(error)) {
      return new AppError(error, {
        cause: error,
      });
    }
    return new AppError(defaultCode, {
      message: error,
      cause: error,
    });
  }

  if (error && typeof error === "object" && "code" in error) {
    const anyError = error as Record<string, unknown>;
    const codeValue = anyError.code;
    if (typeof codeValue === "string" && isErrorCode(codeValue)) {
      return new AppError(codeValue, {
        message: typeof anyError.message === "string" ? anyError.message : undefined,
        userMessage: typeof anyError.userMessage === "string" ? anyError.userMessage : undefined,
        retryable: typeof anyError.retryable === "boolean" ? anyError.retryable : undefined,
        correlationId:
          typeof anyError.correlationId === "string" ? anyError.correlationId : undefined,
        details:
          typeof anyError.details === "object" && anyError.details !== null
            ? (anyError.details as Record<string, unknown>)
            : undefined,
        cause: error,
      });
    }
  }

  // それ以外 (オブジェクト等)
  try {
    return new AppError(defaultCode, {
      message: "Non-error object thrown",
      cause: error,
      details: {
        type: typeof error,
        // serialize可能な場合のみ、かつ短く切り詰める
        preview: String(error).slice(0, 100),
      },
    });
  } catch {
    return new AppError(defaultCode, {
      message: "Unknown non-serializable error",
      cause: error,
    });
  }
}
