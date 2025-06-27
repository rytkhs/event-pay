import { SupabaseClient, Session } from '@supabase/supabase-js'
import { AUTH_CONFIG } from '@/config/security'

/**
 * 最適化されたセッション管理クラス
 * セッション更新の効率化とライフサイクル管理
 */
export class SessionManager {
  private lastUpdateCheck = new Map<string, number>()
  
  /**
   * セッション更新が必要かチェック
   */
  private shouldUpdateSession(sessionId: string): boolean {
    const lastCheck = this.lastUpdateCheck.get(sessionId)
    if (!lastCheck) {
      return true
    }
    
    const timeSinceLastCheck = Date.now() - lastCheck
    return timeSinceLastCheck > (AUTH_CONFIG.session.updateAge * 1000)
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
      const { data: { session } } = await supabase.auth.getSession()
      return { updated: false, session }
    }

    try {
      // セッション更新を試行
      const { data, error } = await supabase.auth.refreshSession()
      
      if (error) {
        // eslint-disable-next-line no-console
        console.warn('Session refresh failed:', error.message)
        return { updated: false, session: null }
      }

      // 更新時刻を記録
      this.lastUpdateCheck.set(sessionId, Date.now())
      
      return { updated: true, session: data.session }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Session refresh error:', error)
      return { updated: false, session: null }
    }
  }

  /**
   * セッション有効性チェック
   */
  isSessionValid(session: Session | null): boolean {
    if (!session) {
      return false
    }

    // セッション期限チェック
    const expiresAt = session.expires_at
    if (expiresAt && Date.now() / 1000 > expiresAt) {
      return false
    }

    // 必要なフィールドの存在確認
    return !!(session.user && session.access_token)
  }

  /**
   * セッション期限まで残り時間を計算（秒）
   */
  getSessionTimeRemaining(session: Session | null): number {
    if (!session?.expires_at) {
      return 0
    }
    
    const remaining = session.expires_at - (Date.now() / 1000)
    return Math.max(0, remaining)
  }

  /**
   * セッション更新の優先度判定
   */
  getUpdatePriority(session: Session | null): 'high' | 'medium' | 'low' | 'none' {
    const timeRemaining = this.getSessionTimeRemaining(session)
    
    if (timeRemaining <= 300) { // 5分以内
      return 'high'
    } else if (timeRemaining <= 900) { // 15分以内
      return 'medium'
    } else if (timeRemaining <= 1800) { // 30分以内
      return 'low'
    }
    
    return 'none'
  }

  /**
   * バックグラウンドでのセッション更新
   */
  async backgroundSessionRefresh(
    supabase: SupabaseClient,
    sessionId: string
  ): Promise<void> {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        return
      }

      const priority = this.getUpdatePriority(session)
      
      // 高優先度の場合のみ更新
      if (priority === 'high') {
        await this.refreshSessionIfNeeded(supabase, sessionId)
      }
    } catch (error) {
      // バックグラウンド処理なのでログのみ
      // eslint-disable-next-line no-console
      console.warn('Background session refresh failed:', error)
    }
  }

  /**
   * セッション情報のクリーンアップ
   */
  cleanupSession(sessionId: string): void {
    this.lastUpdateCheck.delete(sessionId)
  }

  /**
   * 全セッション情報のクリーンアップ
   */
  cleanupAllSessions(): void {
    this.lastUpdateCheck.clear()
  }

  /**
   * 統計情報取得
   */
  getStats(): {
    trackedSessions: number
    oldestSessionCheck: number | null
  } {
    const now = Date.now()
    let oldestCheck: number | null = null
    
    Array.from(this.lastUpdateCheck.values()).forEach(timestamp => {
      if (oldestCheck === null || timestamp < oldestCheck) {
        oldestCheck = timestamp
      }
    })

    return {
      trackedSessions: this.lastUpdateCheck.size,
      oldestSessionCheck: oldestCheck ? now - oldestCheck : null
    }
  }
}

// シングルトンインスタンス
let sessionManagerInstance: SessionManager | null = null

export function getSessionManager(): SessionManager {
  if (!sessionManagerInstance) {
    sessionManagerInstance = new SessionManager()
  }
  return sessionManagerInstance
}

export function resetSessionManager(): void {
  if (sessionManagerInstance) {
    sessionManagerInstance.cleanupAllSessions()
    sessionManagerInstance = null
  }
}