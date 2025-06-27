import { Session } from '@supabase/supabase-js'

/**
 * セッションキャッシュ機能
 * ミドルウェアでのSupabaseセッション確認の効率化
 */

interface CachedSession {
  session: Session | null
  expiresAt: number
  userId: string
}

export class SessionCache {
  private cache = new Map<string, CachedSession>()
  private readonly TTL_MS = 5 * 60 * 1000 // 5分間キャッシュ
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor() {
    this.startPeriodicCleanup()
  }

  /**
   * セッションをキャッシュから取得
   */
  get(sessionKey: string): Session | null {
    const cached = this.cache.get(sessionKey)
    
    if (!cached) {
      return null
    }
    
    // 期限切れチェック
    if (Date.now() > cached.expiresAt) {
      this.cache.delete(sessionKey)
      return null
    }
    
    return cached.session
  }

  /**
   * セッションをキャッシュに保存
   */
  set(sessionKey: string, session: Session | null, userId: string): void {
    const expiresAt = Date.now() + this.TTL_MS
    
    this.cache.set(sessionKey, {
      session,
      expiresAt,
      userId
    })
  }

  /**
   * セッションをキャッシュから削除
   */
  delete(sessionKey: string): void {
    this.cache.delete(sessionKey)
  }

  /**
   * ユーザーIDに基づいてセッションを削除（ログアウト時）
   */
  deleteByUserId(userId: string): void {
    Array.from(this.cache.entries()).forEach(([key, cached]) => {
      if (cached.userId === userId) {
        this.cache.delete(key)
      }
    })
  }

  /**
   * 定期的なキャッシュクリーンアップ
   */
  private startPeriodicCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, 2 * 60 * 1000) // 2分間隔

    // Node.js環境でのみプロセス終了時のクリーンアップを設定
    if (typeof process !== 'undefined' && process.on) {
      process.on('exit', () => this.stopCleanup())
      process.on('SIGINT', () => this.stopCleanup())
      process.on('SIGTERM', () => this.stopCleanup())
    }
  }

  private stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }

  private cleanup(): void {
    const now = Date.now()
    const expiredKeys: string[] = []

    Array.from(this.cache.entries()).forEach(([key, cached]) => {
      if (now > cached.expiresAt) {
        expiredKeys.push(key)
      }
    })

    expiredKeys.forEach(key => this.cache.delete(key))
  }

  /**
   * キャッシュ統計情報
   */
  getStats(): {
    totalEntries: number
    expiredEntries: number
  } {
    const now = Date.now()
    let expiredCount = 0

    Array.from(this.cache.values()).forEach(cached => {
      if (now > cached.expiresAt) {
        expiredCount++
      }
    })

    return {
      totalEntries: this.cache.size,
      expiredEntries: expiredCount
    }
  }

  /**
   * テスト用クリア
   */
  clear(): void {
    this.cache.clear()
    this.stopCleanup()
  }
}

// シングルトンインスタンス
let sessionCacheInstance: SessionCache | null = null

export function getSessionCache(): SessionCache {
  if (!sessionCacheInstance) {
    sessionCacheInstance = new SessionCache()
  }
  return sessionCacheInstance
}

export function resetSessionCache(): void {
  if (sessionCacheInstance) {
    sessionCacheInstance.clear()
    sessionCacheInstance = null
  }
}