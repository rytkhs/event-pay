import { ZodError } from "zod";

import { AppError } from "./app-error";
import type { ErrorCode } from "./types";

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
    return new AppError(defaultCode, {
      message: error,
      cause: error,
    });
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
