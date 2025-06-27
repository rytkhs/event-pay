export interface RateLimitData {
  attempts: number
  windowStart: number
  blockedUntil?: number
}

export interface RateLimitResult {
  allowed: boolean
  retryAfter?: number
}

export interface RateLimitStore {
  get(key: string): Promise<RateLimitData | null>
  set(key: string, data: RateLimitData, ttlMs?: number): Promise<void>
  delete(key: string): Promise<void>
}

export interface RateLimitConfig {
  windowMs: number
  maxAttempts: number
  blockDurationMs: number
}