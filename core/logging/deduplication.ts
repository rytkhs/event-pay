import { Redis } from "@upstash/redis";

import { hashToken } from "@core/security/crypto";

const redisClients = new Map<string, Redis>();

function getRedisClient(url: string, token: string): Redis {
  const cacheKey = `${url}|${token}`;
  const cachedClient = redisClients.get(cacheKey);
  if (cachedClient) {
    return cachedClient;
  }

  const client = new Redis({ url, token });
  redisClients.set(cacheKey, client);
  return client;
}

function normalizeStackLine(line: string): string {
  // 行番号・列番号揺れによるハッシュ変動を抑える
  return line.replace(/:\d+:\d+(?=\)?$)/g, "").replace(/:\d+(?=\)?$)/g, "");
}

function normalizeStackFingerprint(stack?: string): string {
  if (!stack) return "";
  return stack
    .split("\n")
    .slice(0, 3)
    .map((line) => normalizeStackLine(line))
    .join("\n");
}

export async function createErrorDedupeHash(message: string, stack?: string): Promise<string> {
  const normalizedMessage = message.trim();
  const stackFingerprint = normalizeStackFingerprint(stack);
  const fingerprint = `${normalizedMessage}\n${stackFingerprint}`;
  return hashToken(fingerprint);
}

/**
 * 重複排除ルールに基づいて、エラーをログ出力すべきかチェック
 * エラーをログ出力すべき場合（重複でない場合）は true を、それ以外の場合は false を返す
 *
 * @param message エラーメッセージ
 * @param stack スタックトレース
 * @param envVars Redis環境変数（省略時はprocess.envから取得）
 * @param ttlSeconds 重複排除キーの有効期限（秒）（デフォルト: 300s = 5m）
 */
export async function shouldLogError(
  message: string,
  stack?: string,
  envVars?: { redisUrl?: string; redisToken?: string; dedupeHash?: string },
  ttlSeconds: number = 300
): Promise<boolean> {
  const url = envVars?.redisUrl ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = envVars?.redisToken ?? process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    // Redis が設定されていない場合は、常にエラーを記録する（セーフガード）
    return true;
  }

  const redis = getRedisClient(url, token);

  try {
    const hash = envVars?.dedupeHash ?? (await createErrorDedupeHash(message, stack));

    const key = `error_dedupe:${hash}`;

    // NX 付きセットで重複判定を原子的に実施
    const setResult = await redis.set(key, "1", { ex: ttlSeconds, nx: true });
    if (!setResult) {
      const counterKey = `error_count:${hash}`;
      // 重複カウントを記録
      try {
        await redis.incr(counterKey);
      } catch {
        // カウント失敗は無視（重要ではない）
      }
      // duplicate時にキーが新規作成されても無期限化しないようTTLを保証
      try {
        await redis.expire(counterKey, ttlSeconds);
      } catch {
        // TTL設定失敗は無視（重複判定自体には影響しない）
      }
      return false;
    }

    // 新規エラーとして重複カウンタを初期化
    await redis.set(`error_count:${hash}`, "1", { ex: ttlSeconds });
    return true;
  } catch (error) {
    // 構造化ログで記録
    if (typeof console.error === "function") {
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

/**
 * 先行確保した重複排除キーを解放する。
 * DB永続化に失敗した場合などに呼び出し、誤抑制を防ぐ。
 */
export async function releaseErrorDedupeHash(
  dedupeHash: string,
  envVars?: { redisUrl?: string; redisToken?: string }
): Promise<void> {
  const url = envVars?.redisUrl ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = envVars?.redisToken ?? process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return;
  }

  const redis = getRedisClient(url, token);

  try {
    await redis.del(`error_dedupe:${dedupeHash}`);
  } catch (error) {
    if (typeof console.error === "function") {
      console.error(
        JSON.stringify({
          level: "error",
          msg: "Deduplication Redis key release failed",
          timestamp: new Date().toISOString(),
          service: "eventpay",
          tag: "deduplicationReleaseError",
          error_message: error instanceof Error ? error.message : String(error),
        })
      );
    }
  }
}
