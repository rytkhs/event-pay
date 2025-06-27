import { RateLimitStore, RateLimitData } from './types'

/**
 * 最適化されたメモリベースレート制限ストア
 * パフォーマンス改善とメモリ効率化を図る
 */
export class OptimizedMemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, RateLimitData & { expireAt: number }>()
  private cleanupInterval: NodeJS.Timeout | null = null
  private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // 5分間隔でクリーンアップ
  private readonly MAX_ENTRIES = 10000 // メモリ制限
  
  constructor() {
    this.startPeriodicCleanup()
  }

  async get(key: string): Promise<RateLimitData | null> {
    const data = this.store.get(key)
    
    if (!data) {
      return null
    }
    
    // 期限切れチェック
    if (Date.now() > data.expireAt) {
      this.store.delete(key)
      return null
    }
    
    // expireAtフィールドを除外して返却
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { expireAt: _, ...rateLimitData } = data
    return rateLimitData
  }

  async set(key: string, data: RateLimitData, ttlMs: number = 24 * 60 * 60 * 1000): Promise<void> {
    const expireAt = Date.now() + ttlMs
    
    // メモリ制限チェック
    if (this.store.size >= this.MAX_ENTRIES) {
      this.performEmergencyCleanup()
    }
    
    this.store.set(key, { ...data, expireAt })
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key)
  }

  /**
   * 期限切れエントリの定期削除
   */
  private startPeriodicCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, this.CLEANUP_INTERVAL_MS)
    
    // プロセス終了時のクリーンアップ
    process.on('exit', () => this.stopPeriodicCleanup())
    process.on('SIGINT', () => this.stopPeriodicCleanup())
    process.on('SIGTERM', () => this.stopPeriodicCleanup())
  }

  private stopPeriodicCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }

  /**
   * 期限切れエントリを削除してメモリを解放
   */
  private cleanup(): void {
    const now = Date.now()
    const expiredKeys: string[] = []
    
    Array.from(this.store.entries()).forEach(([key, data]) => {
      if (now > data.expireAt) {
        expiredKeys.push(key)
      }
    })
    
    expiredKeys.forEach(key => this.store.delete(key))
    
    // デバッグ情報（本番環境では削除）
    if (process.env.NODE_ENV === 'development' && expiredKeys.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`Rate limit cleanup: removed ${expiredKeys.length} expired entries`)
    }
  }

  /**
   * 緊急時のメモリ解放
   * 最も古いエントリから削除
   */
  private performEmergencyCleanup(): void {
    const entries = Array.from(this.store.entries())
      .sort(([, a], [, b]) => a.expireAt - b.expireAt)
    
    // 古いエントリの30%を削除
    const removeCount = Math.floor(entries.length * 0.3)
    for (let i = 0; i < removeCount; i++) {
      this.store.delete(entries[i][0])
    }
    
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.warn(`Rate limit emergency cleanup: removed ${removeCount} entries`)
    }
  }

  /**
   * メモリ使用量の最適化
   * - 不要なデータ構造の圧縮
   * - V8エンジンのGC最適化のヒント提供
   */
  private compress(): void {
    // 現在のストアサイズが小さい場合は圧縮不要
    if (this.store.size < 1000) {
      return
    }
    
    // 期限が近いエントリを整理
    const now = Date.now()
    const threshold = 10 * 60 * 1000 // 10分以内に期限切れとなるエントリ
    
    Array.from(this.store.entries()).forEach(([key, data]) => {
      if (data.expireAt - now < threshold) {
        this.store.delete(key)
      }
    })
    
    // Node.jsのGCヒント（可能な場合）
    if (global.gc && process.env.NODE_ENV === 'development') {
      global.gc()
    }
  }

  /**
   * 統計情報の取得（監視・デバッグ用）
   */
  getStats(): {
    totalEntries: number
    expiredEntries: number
    memoryUsageEstimate: number
  } {
    const now = Date.now()
    let expiredCount = 0
    
    Array.from(this.store.values()).forEach(data => {
      if (now > data.expireAt) {
        expiredCount++
      }
    })
    
    return {
      totalEntries: this.store.size,
      expiredEntries: expiredCount,
      memoryUsageEstimate: this.store.size * 100 // 大まかな見積もり（バイト）
    }
  }

  /**
   * テスト用のクリーンアップメソッド
   */
  clear(): void {
    this.store.clear()
    this.stopPeriodicCleanup()
  }
}