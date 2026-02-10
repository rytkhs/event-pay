import { Redis } from "@upstash/redis";

import { hashToken } from "@core/security/crypto";

// 認証情報がある場合にのみ Redis クライアントを初期化する
const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? Redis.fromEnv()
    : null;

/**
 * 重複排除ルールに基づいて、エラーをログ出力すべきかチェック
 * エラーをログ出力すべき場合（重複でない場合）は true を、それ以外の場合は false を返す
 *
 * @param message エラーメッセージ
 * @param stack スタックトレース
 * @param ttlSeconds 重複排除キーの有効期限（秒）（デフォルト: 300s = 5m）
 */
export async function shouldLogError(
  message: string,
  stack?: string,
  ttlSeconds: number = 300
): Promise<boolean> {
  if (!redis) {
    // Redis が設定されていない場合は、常にエラーを記録する（セーフガード）
    return true;
  }

  try {
    // スタックトレースから最初の3行のみを使用 (メソッド名とファイル名)
    // 行番号の変更でハッシュが変わるのを防ぐ
    const stackLines = stack?.split("\n").slice(0, 3).join("\n") || "";

    const hash = await hashToken(message + stackLines);

    const key = `error_dedupe:${hash}`;

    // 重複排除キーが存在するかチェック
    const exists = await redis.get(key);

    if (exists) {
      // 重複カウントを記録
      await redis.incr(`error_count:${hash}`).catch(() => {
        // カウント失敗は無視（重要ではない）
      });
      return false;
    }

    // 重複排除キーを設定
    await redis.set(key, "1", { ex: ttlSeconds });
    await redis.set(`error_count:${hash}`, "1", { ex: ttlSeconds });
    return true;
  } catch (error) {
    // 構造化ログで記録
    if (typeof console.error === "function") {
      // eslint-disable-next-line no-console
      console.error(
        JSON.stringify({
          level: "error",
          msg: "Deduplication Redis operation failed",
          timestamp: new Date().toISOString(),
          service: "eventpay",
          tag: "deduplicationError",
          error_message: error instanceof Error ? error.message : String(error),
        })
      );
    }
    return true; // Fail-safe
  }
}
