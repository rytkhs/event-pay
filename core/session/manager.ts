import { SupabaseClient, Session } from "@supabase/supabase-js";
import { SESSION_CONFIG, type SessionUpdatePriority } from "./config";
import { logger } from "@core/logging/app-logger";

/**
 * 最適化されたセッション管理クラス
 * セッション更新の効率化とライフサイクル管理
 */
export class SessionManager {
  private lastUpdateCheck = new Map<string, number>();

  /**
   * セッション更新が必要かチェック
   */
  private shouldUpdateSession(sessionId: string): boolean {
    const lastCheck = this.lastUpdateCheck.get(sessionId);
    if (!lastCheck) {
      return true;
    }

    const timeSinceLastCheck = Date.now() - lastCheck;
    return timeSinceLastCheck > SESSION_CONFIG.updateAge * 1000;
  }

  /**
   * 効率的なセッション更新
   */
  async refreshSessionIfNeeded(
    supabase: SupabaseClient,
    sessionId: string
  ): Promise<{ updated: boolean; session: Session | null }> {
    // 更新不要な場合は早期リターン
    if (!this.shouldUpdateSession(sessionId)) {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      return { updated: false, session };
    }

    try {
      // セッション更新を試行
      const { data, error } = await supabase.auth.refreshSession();

      if (error) {
        logger.warn("Session refresh failed", {
          tag: "sessionRefreshFailed",
          error_message: error.message,
          session_id: sessionId
        });
        return { updated: false, session: null };
      }

      // 更新時刻を記録
      this.lastUpdateCheck.set(sessionId, Date.now());

      return { updated: true, session: data.session };
    } catch (error) {
      logger.error("Session refresh error", {
        tag: "sessionRefreshException",
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
        session_id: sessionId
      });
      return { updated: false, session: null };
    }
  }

  /**
   * セッション有効性チェック
   */
  isSessionValid(session: Session | null): boolean {
    if (!session) {
      return false;
    }

    // セッション期限チェック
    const expiresAt = session.expires_at;
    if (expiresAt && Date.now() / 1000 > expiresAt) {
      return false;
    }

    // 必要なフィールドの存在確認
    return !!(session.user && session.access_token);
  }

  /**
   * セッション期限まで残り時間を計算（秒）
   */
  getSessionTimeRemaining(session: Session | null): number {
    if (!session?.expires_at) {
      return 0;
    }

    const remaining = session.expires_at - Date.now() / 1000;
    return Math.max(0, remaining);
  }

  /**
   * セッション更新の優先度判定
   */
  getUpdatePriority(session: Session | null): SessionUpdatePriority {
    const timeRemaining = this.getSessionTimeRemaining(session);

    if (timeRemaining <= SESSION_CONFIG.refreshThreshold.high) {
      return "high";
    } else if (timeRemaining <= SESSION_CONFIG.refreshThreshold.medium) {
      return "medium";
    } else if (timeRemaining <= SESSION_CONFIG.refreshThreshold.low) {
      return "low";
    }

    return "none";
  }

  /**
   * バックグラウンドでのセッション更新
   */
  async backgroundSessionRefresh(supabase: SupabaseClient, sessionId: string): Promise<void> {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        return;
      }

      const priority = this.getUpdatePriority(session);

      // 高優先度の場合のみ更新
      if (priority === "high") {
        await this.refreshSessionIfNeeded(supabase, sessionId);
      }
    } catch (error) {
      // バックグラウンド処理なのでログのみ
      logger.warn("Background session refresh failed", {
        tag: "backgroundSessionRefreshFailed",
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
        session_id: sessionId
      });
    }
  }

  /**
   * セッション情報のクリーンアップ
   */
  cleanupSession(sessionId: string): void {
    this.lastUpdateCheck.delete(sessionId);
  }

  /**
   * 全セッション情報のクリーンアップ
   */
  cleanupAllSessions(): void {
    this.lastUpdateCheck.clear();
  }

  /**
   * 統計情報取得
   */
  getStats(): {
    trackedSessions: number;
    oldestSessionCheck: number | null;
  } {
    const now = Date.now();
    let oldestCheck: number | null = null;

    Array.from(this.lastUpdateCheck.values()).forEach((timestamp) => {
      if (oldestCheck === null || timestamp < oldestCheck) {
        oldestCheck = timestamp;
      }
    });

    return {
      trackedSessions: this.lastUpdateCheck.size,
      oldestSessionCheck: oldestCheck ? now - oldestCheck : null,
    };
  }
}

// シングルトンインスタンス
let sessionManagerInstance: SessionManager | null = null;

export function getSessionManager(): SessionManager {
  if (!sessionManagerInstance) {
    sessionManagerInstance = new SessionManager();
  }
  return sessionManagerInstance;
}
