import "server-only";

import { handleServerError } from "@core/utils/error-handler.server";

/**
 * 必須環境変数を取得する。未設定なら ENV_VAR_MISSING を記録して throw する。
 *
 * キー名ではなく値を受け取るのは、呼び出し側に `process.env.X` の字面を残すため。
 * 内部で `process.env[key]` の動的アクセスにすると、Next.js が `NEXT_PUBLIC_*` を
 * ビルド時にインライン展開できず、ブラウザ側で undefined になる。
 *
 * @param value 呼び出し側で読んだ `process.env.X`
 * @param name エラーに記録する変数名
 * @param action 監査ログに残す操作名
 */
export function requireEnv(value: string | undefined, name: string, action: string): string {
  if (!value) {
    const message = `Missing required environment variable: ${name}`;
    handleServerError("ENV_VAR_MISSING", {
      category: "system",
      action,
      actorType: "system",
      additionalData: {
        variable_name: name,
      },
    });
    throw new Error(message);
  }
  return value;
}
