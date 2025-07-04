import { Redis } from "@upstash/redis";
import { constantTimeCompare, randomDelay } from "./crypto";

// ブルートフォース対策の設定
const BRUTE_FORCE_CONFIG = {
  MAX_ATTEMPTS: 5, // 最大試行回数
  LOCKOUT_DURATION: 15 * 60, // ロックアウト時間（15分）
  ATTEMPT_WINDOW: 60 * 60, // 試行回数リセット時間（1時間）
  TOKEN_INVALIDATION_THRESHOLD: 3, // トークン無効化の閾値
} as const;

// Redis接続（シングルトン）
let redisInstance: Redis | null = null;

function getRedisInstance(): Redis {
  if (!redisInstance) {
    redisInstance = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  return redisInstance;
}

/**
 * OTP試行回数を記録するキー生成
 */
function getAttemptKey(identifier: string, tokenOrEmail: string): string {
  return `otp_attempts:${identifier}:${tokenOrEmail}`;
}

/**
 * アカウントロックアウトキー生成
 */
function getLockoutKey(identifier: string): string {
  return `otp_lockout:${identifier}`;
}

/**
 * OTP試行の記録と制限チェック
 */
export async function checkOtpAttemptLimit(
  identifier: string, // IP, ユーザーID, メールアドレスなど
  tokenOrEmail: string, // トークンまたはメールアドレス
  attemptType: "ip" | "user" | "token" = "ip"
): Promise<{
  allowed: boolean;
  remainingAttempts: number;
  lockoutTimeRemaining?: number;
  shouldInvalidateToken?: boolean;
}> {
  const redis = getRedisInstance();
  const attemptKey = getAttemptKey(identifier, tokenOrEmail);
  const lockoutKey = getLockoutKey(identifier);

  try {
    // ロックアウト状態をチェック
    const lockoutExpiry = await redis.get(lockoutKey);
    if (lockoutExpiry) {
      const timeRemaining = Math.max(0, parseInt(lockoutExpiry as string) - Date.now());
      if (timeRemaining > 0) {
        return {
          allowed: false,
          remainingAttempts: 0,
          lockoutTimeRemaining: Math.ceil(timeRemaining / 1000),
        };
      } else {
        // ロックアウト期間が過ぎた場合、キーを削除
        await redis.del(lockoutKey);
      }
    }

    // 現在の試行回数を取得
    const currentAttempts = await redis.get(attemptKey);
    const attempts = currentAttempts ? parseInt(currentAttempts as string) : 0;

    // 最大試行回数をチェック
    if (attempts >= BRUTE_FORCE_CONFIG.MAX_ATTEMPTS) {
      // ロックアウトを設定
      const lockoutExpiry = Date.now() + BRUTE_FORCE_CONFIG.LOCKOUT_DURATION * 1000;
      await redis.setex(lockoutKey, BRUTE_FORCE_CONFIG.LOCKOUT_DURATION, lockoutExpiry.toString());

      // トークン無効化が必要かチェック
      const shouldInvalidateToken =
        attemptType === "token" && attempts >= BRUTE_FORCE_CONFIG.TOKEN_INVALIDATION_THRESHOLD;

      return {
        allowed: false,
        remainingAttempts: 0,
        lockoutTimeRemaining: BRUTE_FORCE_CONFIG.LOCKOUT_DURATION,
        shouldInvalidateToken,
      };
    }

    return {
      allowed: true,
      remainingAttempts: BRUTE_FORCE_CONFIG.MAX_ATTEMPTS - attempts,
    };
  } catch {
    // 本番環境では適切なログシステムに出力
    if (process.env.NODE_ENV === "development") {
      // console.error("OTP attempt limit check failed:", _);
    }
    // エラー時はフェイルセーフ（厳格にブロック）
    return {
      allowed: false,
      remainingAttempts: 0,
    };
  }
}

/**
 * OTP試行を記録（失敗時）
 */
export async function recordOtpAttempt(identifier: string, tokenOrEmail: string): Promise<void> {
  const redis = getRedisInstance();
  const attemptKey = getAttemptKey(identifier, tokenOrEmail);

  try {
    // 試行回数をインクリメント
    const newCount = await redis.incr(attemptKey);

    // 初回の場合は有効期限を設定
    if (newCount === 1) {
      await redis.expire(attemptKey, BRUTE_FORCE_CONFIG.ATTEMPT_WINDOW);
    }

    // セキュリティログ - 本番環境では適切なログシステムに出力
    if (process.env.NODE_ENV === "development") {
      // console.warn("OTP verification failed:", {
      //   identifier,
      //   tokenOrEmail: tokenOrEmail.replace(/(.{2}).*(@.*)?/, "$1***$2"),
      //   attempts: newCount,
      //   timestamp: new Date().toISOString(),
      // });
    }
  } catch {
    // 本番環境では適切なログシステムに出力
    if (process.env.NODE_ENV === "development") {
      // console.error("Failed to record OTP attempt:", _);
    }
  }
}

/**
 * OTP試行カウンターをリセット（成功時）
 */
export async function resetOtpAttempts(identifier: string, tokenOrEmail: string): Promise<void> {
  const redis = getRedisInstance();
  const attemptKey = getAttemptKey(identifier, tokenOrEmail);

  try {
    await redis.del(attemptKey);
  } catch {
    // 本番環境では適切なログシステムに出力
    if (process.env.NODE_ENV === "development") {
      // console.error("Failed to reset OTP attempts:", _);
    }
  }
}

/**
 * セキュアなOTP検証（ブルートフォース対策付き）
 */
export async function verifyOtpSecure(
  inputOtp: string,
  storedOtp: string,
  identifier: string,
  tokenOrEmail: string,
  attemptType: "ip" | "user" | "token" = "ip"
): Promise<{
  success: boolean;
  error?: string;
  shouldInvalidateToken?: boolean;
  lockoutTimeRemaining?: number;
}> {
  // タイミング攻撃防止のため、必ず処理時間を一定にする
  const startTime = Date.now();

  try {
    // 試行制限をチェック
    const limitCheck = await checkOtpAttemptLimit(identifier, tokenOrEmail, attemptType);

    if (!limitCheck.allowed) {
      // タイミング正規化
      await randomDelay(200, 800);

      if (limitCheck.lockoutTimeRemaining) {
        return {
          success: false,
          error: `試行回数の上限に達しました。${Math.ceil(limitCheck.lockoutTimeRemaining / 60)}分後に再度お試しください。`,
          lockoutTimeRemaining: limitCheck.lockoutTimeRemaining,
          shouldInvalidateToken: limitCheck.shouldInvalidateToken,
        };
      } else {
        return {
          success: false,
          error: "試行回数が上限に達しました。新しいコードを取得してください。",
          shouldInvalidateToken: limitCheck.shouldInvalidateToken,
        };
      }
    }

    // OTPコードの検証（定数時間比較）
    const isValid = constantTimeCompare(inputOtp, storedOtp);

    if (isValid) {
      // 成功時は試行カウンターをリセット
      await resetOtpAttempts(identifier, tokenOrEmail);

      // タイミング正規化
      const elapsed = Date.now() - startTime;
      if (elapsed < 500) {
        await new Promise((resolve) => setTimeout(resolve, 500 - elapsed));
      }

      return { success: true };
    } else {
      // 失敗時は試行を記録
      await recordOtpAttempt(identifier, tokenOrEmail);

      // タイミング正規化
      await randomDelay(200, 800);

      return {
        success: false,
        error: "コードが正しくありません。",
      };
    }
  } catch {
    // 本番環境では適切なログシステムに出力
    if (process.env.NODE_ENV === "development") {
      // console.error("OTP verification error:", _);
    }

    // タイミング正規化
    await randomDelay(200, 800);

    return {
      success: false,
      error: "認証に失敗しました。再度お試しください。",
    };
  }
}

/**
 * トークンの有効期限チェック
 */
export function isTokenExpired(createdAt: Date, expirationMinutes: number = 15): boolean {
  const expirationTime = new Date(createdAt.getTime() + expirationMinutes * 60 * 1000);
  return new Date() > expirationTime;
}

/**
 * テスト用のヘルパー関数
 */
export const __testing__ = {
  getAttemptKey,
  getLockoutKey,
  BRUTE_FORCE_CONFIG,
  resetRedisInstance: () => {
    redisInstance = null;
  },
};
