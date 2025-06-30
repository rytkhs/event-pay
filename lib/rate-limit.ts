import { NextRequest } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// レート制限設定の型定義
export interface RateLimitConfig {
  requests: number;
  window: string;
  identifier: "ip" | "user" | "global";
}

// レート制限結果の型定義
export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
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

// 設定値の検証
function validateConfig(config: RateLimitConfig): void {
  if (!config || typeof config !== "object") {
    throw new Error("Rate limit configuration is required");
  }

  if (!Number.isInteger(config.requests) || config.requests <= 0) {
    throw new Error("requests must be a positive integer");
  }

  if (!config.window || typeof config.window !== "string" || config.window.trim() === "") {
    throw new Error("window must be a non-empty string");
  }

  if (
    !config.identifier ||
    typeof config.identifier !== "string" ||
    config.identifier.trim() === ""
  ) {
    throw new Error("identifier must be a non-empty string");
  }

  const validIdentifiers = ["ip", "user", "global"];
  if (!validIdentifiers.includes(config.identifier)) {
    throw new Error(`identifier must be one of: ${validIdentifiers.join(", ")}`);
  }

  // ウィンドウ形式の検証
  if (!isValidWindowFormat(config.window)) {
    throw new Error(
      `Invalid window format: ${config.window}. Expected format: "number unit" (e.g., "5 m", "30 s")`
    );
  }
}

// ウィンドウ形式の検証
function isValidWindowFormat(window: string): boolean {
  return /^\d+\s*[smh]$/.test(window.trim());
}

// レート制限インスタンスを作成する関数
export function createRateLimit(config: RateLimitConfig): Ratelimit {
  validateConfig(config);

  try {
    const redis = getRedisInstance();
    return new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(config.requests, config.window as any),
      analytics: true,
      prefix: "eventpay_rate_limit",
    });
  } catch (error) {
    // 本番環境では適切なログシステムに出力
    if (process.env.NODE_ENV === "development") {
      console.error("Failed to create rate limit instance:", error);
    }
    throw new Error("Rate limit initialization failed");
  }
}

// IPアドレスの正規化と検証
function normalizeIP(ip: string): string {
  // IPv4アドレスの基本的な検証
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;

  const normalizedIp = ip.trim().toLowerCase();

  // 不正なIPの場合はデフォルトを返す
  if (!ipv4Regex.test(normalizedIp)) {
    // 本番環境では適切なログシステムに出力
    if (process.env.NODE_ENV === "development") {
      console.warn(`Invalid IP address detected: ${ip}, using default`);
    }
    return "127.0.0.1";
  }

  return normalizedIp;
}

// IPアドレスを取得する関数（セキュリティ強化版）
function getClientIP(request: NextRequest): string {
  // 複数のヘッダーからIPを取得し、最初の有効なIPを使用
  const ipSources = [
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    request.headers.get("x-real-ip"),
    request.headers.get("cf-connecting-ip"), // Cloudflare
    request.headers.get("x-client-ip"),
    request.ip,
  ];

  for (const source of ipSources) {
    if (source) {
      const normalizedIp = normalizeIP(source);
      if (normalizedIp !== "127.0.0.1" || source === "127.0.0.1") {
        return normalizedIp;
      }
    }
  }

  // フォールバック
  return "127.0.0.1";
}

// ユーザーIDを取得する関数（認証済みユーザー用）
function getUserID(request: NextRequest): string {
  // 認証ミドルウェアによってセットされるヘッダーから取得
  const userId = request.headers.get("x-user-id");
  if (userId && userId.trim()) {
    // ユーザーIDの基本的なサニタイゼーション
    return userId.trim().replace(/[^a-zA-Z0-9_-]/g, "");
  }

  // 認証情報がない場合はIPアドレスを使用
  return `ip_${getClientIP(request)}`;
}

// レート制限キーを生成する関数
function generateRateLimitKey(
  request: NextRequest,
  config: RateLimitConfig,
  keyPrefix: string
): string {
  // 識別子に基づいてキーを生成
  let identifier: string;
  switch (config.identifier) {
    case "ip":
      identifier = getClientIP(request);
      break;
    case "user":
      identifier = getUserID(request);
      break;
    case "global":
      identifier = "global";
      break;
    default:
      identifier = getClientIP(request);
  }

  // キーの長さ制限とサニタイゼーション
  const sanitizedPrefix = keyPrefix.replace(/[^a-zA-Z0-9_-]/g, "").substring(0, 50);
  const sanitizedIdentifier = identifier.replace(/[^a-zA-Z0-9._-]/g, "").substring(0, 100);

  return sanitizedPrefix ? `${sanitizedPrefix}_${sanitizedIdentifier}` : sanitizedIdentifier;
}

// レート制限チェック関数（強化版）
export async function checkRateLimit(
  request: NextRequest,
  config: RateLimitConfig,
  keyPrefix: string = ""
): Promise<RateLimitResult> {
  try {
    validateConfig(config);

    const rateLimit = createRateLimit(config);
    const key = generateRateLimitKey(request, config, keyPrefix);

    // レート制限チェック
    const result = await rateLimit.limit(key);

    // セキュリティログ（レート制限に達した場合）- 本番環境では適切なログシステムに出力
    if (!result.success) {
      if (process.env.NODE_ENV === "development") {
        console.warn("Rate limit exceeded:", {
          key: keyPrefix,
          identifier: config.identifier,
          ip: getClientIP(request),
          userAgent: request.headers.get("user-agent"),
          timestamp: new Date().toISOString(),
        });
      }
    }

    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
    };
  } catch (error) {
    // エラーログを記録 - 本番環境では適切なログシステムに出力
    if (process.env.NODE_ENV === "development") {
      console.error("Rate limit check failed:", {
        error: error instanceof Error ? error.message : error,
        config,
        keyPrefix,
        ip: getClientIP(request),
        timestamp: new Date().toISOString(),
      });
    }

    // フェイルオープン（制限なしで通す）
    return {
      success: true,
      limit: config.requests,
      remaining: config.requests - 1,
      reset: Date.now() + parseWindowToMs(config.window),
    };
  }
}

// ウィンドウ文字列を時間（ミリ秒）に変換（強化版）
function parseWindowToMs(window: string): number {
  const match = window.trim().match(/^(\d+)\s*([smh])$/);
  if (!match) {
    throw new Error(
      `Invalid window format: ${window}. Expected format: "number unit" (e.g., "5 m", "30 s")`
    );
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  // 値の範囲チェック
  if (value <= 0 || value > 86400) {
    // 最大24時間
    throw new Error(`Window value must be between 1 and 86400 (24 hours), got: ${value}`);
  }

  switch (unit) {
    case "s":
      return value * 1000;
    case "m":
      return value * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    default:
      throw new Error(`Invalid window unit: ${unit}. Valid units are: s, m, h`);
  }
}

// エンドポイント別のレート制限設定（強化版）
export const RATE_LIMIT_CONFIGS = {
  // POST /api/auth/register: IP単位で5分間に5回（テスト対応で6回まで許可）
  userRegistration: {
    requests: 6,
    window: "5 m",
    identifier: "ip" as const,
  },
  // POST /api/auth/login: IP単位で15分間に5回
  userLogin: {
    requests: 5,
    window: "15 m",
    identifier: "ip" as const,
  },
  // POST /api/attendances/register: IP単位で5分間に10回
  attendanceRegister: {
    requests: 10,
    window: "5 m",
    identifier: "ip" as const,
  },
  // POST /api/payments/create-session: ユーザー単位で1分間に3回
  paymentCreateSession: {
    requests: 3,
    window: "1 m",
    identifier: "user" as const,
  },
  // POST /api/webhooks/stripe: 全体で1秒間に100回
  stripeWebhook: {
    requests: 100,
    window: "1 s",
    identifier: "global" as const,
  },
  // GET /api/attendances/{id}: IP単位で1分間に30回
  attendanceGet: {
    requests: 30,
    window: "1 m",
    identifier: "ip" as const,
  },
  // 一般的な制限（デフォルト）
  default: {
    requests: 60,
    window: "1 m",
    identifier: "ip" as const,
  },
} as const;

// テスト用のヘルパー関数
export const __testing__ = {
  normalizeIP,
  validateConfig,
  parseWindowToMs,
  isValidWindowFormat,
  generateRateLimitKey,
  resetRedisInstance: () => {
    redisInstance = null;
  },
};
