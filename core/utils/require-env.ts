import "server-only";

import { AppError } from "@core/errors";
import { handleServerError } from "@core/utils/error-handler.server";

/**
 * 必須環境変数を取得する。未設定なら ENV_VAR_MISSING を記録して throw する。
 *
 * キー名ではなく値を受け取るのは、呼び出し側に `process.env.X` の字面を残すため。
 * 内部で `process.env[key]` の動的アクセスにすると、Next.js が `NEXT_PUBLIC_*` を
 * ビルド時にインライン展開できず、ブラウザ側で undefined になる。
 *
 * 値と名前が別々の引数になるため両者はずれ得る。組み合わせの一致は
 * `tests/architecture/env-declarations.test.ts` が検証する。
 *
 * 投げるのは `AppError` であって素の `Error` ではない。素の `Error` にすると
 * 上位の `normalizeError` で `INTERNAL_ERROR` へ落ち、ENV_VAR_MISSING の
 * severity / retryable / httpStatus が失われる（ADR-0013）。
 *
 * @param value 呼び出し側で読んだ `process.env.X`
 * @param name エラーに記録する変数名
 * @param action 監査ログに残す操作名
 */
export function requireEnv(value: string | undefined, name: string, action: string): string {
  if (!value) {
    const appError = new AppError("ENV_VAR_MISSING", {
      message: `Missing required environment variable: ${name}`,
      details: { variable_name: name },
    });

    handleServerError(appError, {
      category: "system",
      action,
      actorType: "system",
      additionalData: {
        variable_name: name,
      },
    });

    throw appError;
  }
  return value;
}
