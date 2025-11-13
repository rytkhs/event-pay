/**
 * StatusSyncRateLimiter
 * ステータス同期のレート制限を管理
 * Redisを使用してユーザーごとの同期頻度を制限
 */

import "server-only";

import { logger } from "@core/logging/app-logger";
import { enforceRateLimit, type RateLimitPolicy } from "@core/rate-limit";

/**
 * Rate Limit Result
 * レート制限チェックの結果
 */
export interface RateLimitResult {
  /** 許可されたか */
  allowed: boolean;
  /** リトライ可能になるまでの秒数 */
  retryAfter?: number;
  /** 残りの試行回数 */
  remaining?: number;
}

/**
 * StatusSyncRateLimiter
 * ステータス同期のレート制限を管理
 */
export class StatusSyncRateLimiter {
  private policy: RateLimitPolicy;

  constructor() {
    // デフォルトポリシー: 1分間に5回まで
    this.policy = {
      scope: "stripe.connect.status_sync",
      limit: 5,
      window: "1 m",
      blockMs: 60 * 1000, // 1分間ブロック
    };
  }

  /**
   * レート制限をチェック
   * @param userId ユーザーID
   * @returns レート制限結果
   */
  async checkRateLimit(userId: string): Promise<RateLimitResult> {
    try {
      const key = `RL:${this.policy.scope}:user:${userId}`;

      const result = await enforceRateLimit({
        keys: [key],
        policy: this.policy,
        allowIfStoreError: true, // Redisエラー時はフェイルオープン
      });

      if (!result.allowed) {
        logger.warn("Status sync rate limit exceeded", {
          tag: "statusSyncRateLimitExceeded",
          user_id: userId,
          retry_after: result.retryAfter,
        });
      }

      return {
        allowed: result.allowed,
        retryAfter: result.retryAfter,
        remaining: result.remaining,
      };
    } catch (error) {
      // レート制限チェックのエラーはログに記録してフェイルオープン
      logger.error("Rate limit check failed", {
        tag: "statusSyncRateLimitCheckFailed",
        user_id: userId,
        error_message: error instanceof Error ? error.message : String(error),
      });

      // エラー時は許可する（フェイルオープン）
      return {
        allowed: true,
      };
    }
  }

  /**
   * カスタムポリシーでレート制限をチェック
   * @param userId ユーザーID
   * @param customPolicy カスタムポリシー
   * @returns レート制限結果
   */
  async checkRateLimitWithPolicy(
    userId: string,
    customPolicy: RateLimitPolicy
  ): Promise<RateLimitResult> {
    try {
      const key = `RL:${customPolicy.scope}:user:${userId}`;

      const result = await enforceRateLimit({
        keys: [key],
        policy: customPolicy,
        allowIfStoreError: true,
      });

      if (!result.allowed) {
        logger.warn("Status sync rate limit exceeded (custom policy)", {
          tag: "statusSyncRateLimitExceeded",
          user_id: userId,
          policy_scope: customPolicy.scope,
          retry_after: result.retryAfter,
        });
      }

      return {
        allowed: result.allowed,
        retryAfter: result.retryAfter,
        remaining: result.remaining,
      };
    } catch (error) {
      logger.error("Rate limit check failed (custom policy)", {
        tag: "statusSyncRateLimitCheckFailed",
        user_id: userId,
        policy_scope: customPolicy.scope,
        error_message: error instanceof Error ? error.message : String(error),
      });

      return {
        allowed: true,
      };
    }
  }

  /**
   * ポリシーを取得
   * @returns 現在のポリシー
   */
  getPolicy(): RateLimitPolicy {
    return this.policy;
  }

  /**
   * ポリシーを更新
   * @param policy 新しいポリシー
   */
  setPolicy(policy: RateLimitPolicy): void {
    this.policy = policy;
  }
}
