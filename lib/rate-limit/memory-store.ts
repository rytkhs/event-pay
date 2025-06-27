import { RateLimitStore, RateLimitData } from './types'

export class MemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, RateLimitData>()
  private timers = new Map<string, NodeJS.Timeout>()

  async get(key: string): Promise<RateLimitData | null> {
    const data = this.store.get(key)
    return data || null
  }

  async set(key: string, data: RateLimitData, ttlMs?: number): Promise<void> {
    this.store.set(key, data)
    
    if (ttlMs) {
      // 既存のタイマーをクリア
      const existingTimer = this.timers.get(key)
      if (existingTimer) {
        clearTimeout(existingTimer)
      }
      
      // 新しいタイマーを設定
      const timer = setTimeout(() => {
        this.store.delete(key)
        this.timers.delete(key)
      }, ttlMs)
      
      this.timers.set(key, timer)
    }
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key)
    
    const timer = this.timers.get(key)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(key)
    }
  }

  // テスト用のクリーンアップメソッド
  clear(): void {
    this.store.clear()
    this.timers.forEach(timer => clearTimeout(timer))
    this.timers.clear()
  }
}