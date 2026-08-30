import "server-only";

import { AppError } from "@core/errors";
import { handleServerError } from "@core/utils/error-handler.server";

/** 監査ログに残す操作名。欠落の性質は呼び出し元によらず同じなので固定する */
const ENV_VALIDATION_ACTION = "env_validation";

/**
 * 必須環境変数を取得する。未設定なら ENV_VAR_MISSING を記録して throw する。
 *
 * キー名ではなく値を受け取るのは、呼び出し側に `process.env.X` の字面を残すため。
 * 内部で `process.env[key]` の動的アクセスにすると、Next.js が `NEXT_PUBLIC_*` を
 * ビルド時にインライン展開できず、ブラウザ側で undefined になる。
 *
 * この制約により値と名前は別々の引数にならざるを得ず、両者はずれ得る。
 * 組み合わせの一致は `tests/architecture/env-declarations.test.ts` が検証する。
 * 型で表現するにはアクセサの生成が必要で、それは #580 で扱う。
 *
 * 投げるのは `AppError` であって素の `Error` ではない。素の `Error` にすると
 * 上位の `normalizeError` で `INTERNAL_ERROR` へ落ち、ENV_VAR_MISSING の
 * severity / retryable / httpStatus が失われる（ADR-0013）。
 *
 * @param value 呼び出し側で読んだ `process.env.X`
 * @param name エラーに記録する変数名
 */
export function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    const appError = new AppError("ENV_VAR_MISSING", {
      message: `Missing required environment variable: ${name}`,
      details: { variable_name: name },
    });

    handleServerError(appError, {
      category: "system",
      action: ENV_VALIDATION_ACTION,
      actorType: "system",
      additionalData: {
        variable_name: name,
      },
    });

    throw appError;
  }
  return value;
}
