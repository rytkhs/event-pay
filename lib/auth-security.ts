import { Redis } from "@upstash/redis";

// アカウントロックアウト設定
export const ACCOUNT_LOCKOUT_CONFIG = {
  maxFailedAttempts: 10,
  lockoutDurationMs: 30 * 60 * 1000, // 30分
} as const;

// テスト専用アカウントロックアウト設定
export const TEST_ACCOUNT_LOCKOUT_CONFIG = {
  maxFailedAttempts: 20, // テスト用に緩和
  lockoutDurationMs: 5 * 60 * 1000, // 5分に短縮
} as const;

// 型定義
export interface LockoutResult {
  failedAttempts: number;
  isLocked: boolean;
  lockoutExpiresAt?: Date;
}

export interface LockoutStatus {
  isLocked: boolean;
  lockoutExpiresAt?: Date;
  remainingAttempts?: number;
}

// Redis設定の検証と作成
function createRedisInstance(): Redis {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error(
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN environment variables are required"
    );
  }

  return new Redis({ url, token });
}

// Redis インスタンス（シングルトン）
let redisInstance: Redis | null = null;

function getRedisInstance(): Redis {
  if (!redisInstance) {
    redisInstance = createRedisInstance();
  }
  return redisInstance;
}

/**
 * アカウントロックアウト管理クラス
 * EventPay固有のセキュリティ要件に対応したアカウントロックアウト機能を提供
 */
export class AccountLockoutService {
  private static getFailedAttemptsKey(email: string): string {
    return `auth_failed_attempts:${email.toLowerCase()}`;
  }

  private static getLockoutKey(email: string): string {
    return `auth_lockout:${email.toLowerCase()}`;
  }

  private static getConfig() {
    return process.env.NODE_ENV === "test" ? TEST_ACCOUNT_LOCKOUT_CONFIG : ACCOUNT_LOCKOUT_CONFIG;
  }

  /**
   * ログイン失敗を記録し、必要に応じてアカウントをロック
   * @param email ユーザーのメールアドレス
   * @returns ロック状態の情報
   */
  static async recordFailedAttempt(email: string): Promise<LockoutResult> {
    try {
      const redis = getRedisInstance();
      const failedKey = this.getFailedAttemptsKey(email);
      const lockoutKey = this.getLockoutKey(email);
      const config = this.getConfig();

      // 現在の失敗回数を取得
      const rawAttempts = await redis.get<number>(failedKey);
      const currentAttempts = rawAttempts || 0;
      const newAttempts = currentAttempts + 1;

      // 失敗回数を更新（24時間のTTL）
      await redis.setex(failedKey, 24 * 60 * 60, newAttempts);

      // 最大試行回数に達した場合、アカウントをロック
      if (newAttempts >= config.maxFailedAttempts) {
        const lockoutExpiresAt = new Date(Date.now() + config.lockoutDurationMs);
        await redis.setex(
          lockoutKey,
          Math.ceil(config.lockoutDurationMs / 1000),
          lockoutExpiresAt.toISOString()
        );

        // セキュリティログ - 本番環境では適切なログシステムに出力
        if (process.env.NODE_ENV === "development") {
          // console.warn("Account locked due to failed attempts:", {
          //   email: email.replace(/(.{2}).*(@.*)/, "$1***$2"),
          //   attempts: newAttempts,
          //   lockoutExpiresAt: lockoutExpiresAt.toISOString(),
          //   timestamp: new Date().toISOString(),
          // });
        }

        return {
          failedAttempts: newAttempts,
          isLocked: true,
          lockoutExpiresAt,
        };
      }

      return {
        failedAttempts: newAttempts,
        isLocked: false,
      };
    } catch {
      // 本番環境では適切なログシステムに出力
      if (process.env.NODE_ENV === "development") {
        // console.error("Failed to record failed attempt:", _);
      }
      // フェイルオープン（エラー時は制限しない）
      return {
        failedAttempts: 0,
        isLocked: false,
      };
    }
  }

  /**
   * アカウントロック状態を確認
   * @param email ユーザーのメールアドレス
   * @returns ロック状態の詳細情報
   */
  static async checkLockoutStatus(email: string): Promise<LockoutStatus> {
    try {
      const redis = getRedisInstance();
      const failedKey = this.getFailedAttemptsKey(email);
      const lockoutKey = this.getLockoutKey(email);

      // ロック状態を確認
      const lockoutData = (await redis.get(lockoutKey)) as string | null;
      if (lockoutData) {
        const lockoutExpiresAt = new Date(lockoutData);
        if (lockoutExpiresAt > new Date()) {
          return {
            isLocked: true,
            lockoutExpiresAt,
          };
        }
        // 期限切れのロックを削除
        await redis.del(lockoutKey);
      }

      // 現在の失敗回数を確認
      const rawAttempts = await redis.get<number>(failedKey);
      const failedAttempts = rawAttempts || 0;
      const config = this.getConfig();
      const remainingAttempts = Math.max(0, config.maxFailedAttempts - failedAttempts);

      return {
        isLocked: false,
        remainingAttempts,
      };
    } catch {
      // 本番環境では適切なログシステムに出力
      if (process.env.NODE_ENV === "development") {
        // console.error("Failed to check lockout status:", _);
      }
      // フェイルオープン（エラー時は制限しない）
      const config = this.getConfig();
      return {
        isLocked: false,
        remainingAttempts: config.maxFailedAttempts,
      };
    }
  }

  /**
   * ログイン成功時に失敗回数とロックをリセット
   * @param email ユーザーのメールアドレス
   */
  static async clearFailedAttempts(email: string): Promise<void> {
    try {
      const redis = getRedisInstance();
      const failedKey = this.getFailedAttemptsKey(email);
      const lockoutKey = this.getLockoutKey(email);

      await Promise.all([redis.del(failedKey), redis.del(lockoutKey)]);
    } catch {
      // 本番環境では適切なログシステムに出力
      if (process.env.NODE_ENV === "development") {
        // console.error("Failed to clear failed attempts:", _);
      }
      // エラーは記録するが、処理は継続
    }
  }
}

/**
 * タイミング攻撃対策クラス
 * EventPayの決済システムに対するタイミング攻撃を防止
 */
export class TimingAttackProtection {
  /**
   * 一定時間の遅延を追加（タイミング攻撃対策）
   * @param baseDelayMs 基本遅延時間（ミリ秒）
   */
  static async addConstantDelay(baseDelayMs: number = 200): Promise<void> {
    // 200ms ± 50ms のランダム遅延
    const randomDelay = baseDelayMs + Math.random() * 100 - 50;
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, randomDelay)));
  }

  /**
   * レスポンス時間を一定にするためのパディング
   * @param operation 実行する処理
   * @param targetDurationMs 目標実行時間（ミリ秒）
   */
  static async normalizeResponseTime(
    operation: () => Promise<void>,
    targetDurationMs: number = 300
  ): Promise<void> {
    const start = Date.now();
    await operation();
    const elapsed = Date.now() - start;

    if (elapsed < targetDurationMs) {
      await new Promise((resolve) => setTimeout(resolve, targetDurationMs - elapsed));
    }
  }
}

/**
 * 入力値サニタイゼーションクラス
 * EventPayアプリケーション用の安全な入力処理
 */
export class InputSanitizer {
  /**
   * メールアドレスの基本的なサニタイゼーション
   * @param email 入力されたメールアドレス
   * @returns サニタイズされたメールアドレス
   */
  static sanitizeEmail(email: string): string {
    if (typeof email !== "string") {
      throw new Error("Email must be a string");
    }

    // 基本的な長さチェック
    if (email.length > 254) {
      throw new Error("Email address is too long");
    }

    // 基本的なフォーマットチェックはZodバリデーションに依存
    // ここでは最低限のSQLインジェクション対策のみ実行
    if (email.includes("\0") || email.includes("\x1a")) {
      throw new Error("Invalid characters in email");
    }

    return email.toLowerCase().trim();
  }

  /**
   * パスワードの基本的なサニタイゼーション
   * @param password 入力されたパスワード
   * @returns サニタイズされたパスワード
   */
  static sanitizePassword(password: string): string {
    if (typeof password !== "string") {
      throw new Error("Password must be a string");
    }

    // 基本的な長さチェック
    if (password.length > 128) {
      throw new Error("Password is too long");
    }

    if (password.length === 0) {
      throw new Error("Password is required");
    }

    return password;
  }
}
