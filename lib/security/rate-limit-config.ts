/**
 * レート制限設定の検証とヘルパー関数
 * 本番環境Redis設定前提でのレート制限実装
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// レート制限設定の型定義
export interface RateLimitConfig {
  enabled: boolean;
  instance: Ratelimit | null;
  limits: {
    login: { requests: number; window: string };
    register: { requests: number; window: string };
    passwordReset: { requests: number; window: string };
  };
}

// 環境変数の検証
export function validateRateLimitEnvironment(): {
  isValid: boolean;
  missing: string[];
  warnings: string[];
} {
  const missing: string[] = [];
  const warnings: string[] = [];

  // 必須環境変数のチェック
  if (!process.env.RATE_LIMIT_REDIS_URL) {
    missing.push('RATE_LIMIT_REDIS_URL');
  }

  // Redis URLの形式チェック
  if (process.env.RATE_LIMIT_REDIS_URL && !process.env.RATE_LIMIT_REDIS_URL.startsWith('redis://')) {
    warnings.push('RATE_LIMIT_REDIS_URL should start with "redis://"');
  }

  // トークンの存在チェック（Upstash使用時）
  if (process.env.RATE_LIMIT_REDIS_URL && process.env.RATE_LIMIT_REDIS_URL.includes('upstash')) {
    if (!process.env.RATE_LIMIT_REDIS_TOKEN) {
      missing.push('RATE_LIMIT_REDIS_TOKEN');
    }
  }

  return {
    isValid: missing.length === 0,
    missing,
    warnings,
  };
}

// レート制限インスタンスの作成
export function createRateLimitInstance(): RateLimitConfig {
  const validation = validateRateLimitEnvironment();

  // 本番環境では必須
  if (process.env.NODE_ENV === 'production' && !validation.isValid) {
    throw new Error(
      `本番環境でレート制限設定が不完全です: ${validation.missing.join(', ')} が不足しています`
    );
  }

  // 開発環境では警告のみ
  if (process.env.NODE_ENV === 'development' && !validation.isValid) {
    console.warn(
      `⚠️ 開発環境: レート制限が無効です。本番環境では以下の環境変数を設定してください: ${validation.missing.join(', ')}`
    );
  }

  let rateLimitInstance: Ratelimit | null = null;

  if (validation.isValid) {
    try {
      const redisConfig: any = {
        url: process.env.RATE_LIMIT_REDIS_URL!,
      };

      // Upstash使用時はトークンを追加
      if (process.env.RATE_LIMIT_REDIS_TOKEN) {
        redisConfig.token = process.env.RATE_LIMIT_REDIS_TOKEN;
      }

      rateLimitInstance = new Ratelimit({
        redis: new Redis(redisConfig),
        limiter: Ratelimit.slidingWindow(5, '5 m'), // 5分間に5回
        analytics: true,
      });

      console.log('✅ レート制限が有効化されました');
    } catch (error) {
      console.error('❌ レート制限の初期化に失敗しました:', error);
      
      // 本番環境ではエラーを投げる
      if (process.env.NODE_ENV === 'production') {
        throw new Error(`レート制限の初期化に失敗しました: ${error}`);
      }
      
      // 開発環境では無効化
      rateLimitInstance = null;
    }
  }

  return {
    enabled: rateLimitInstance !== null,
    instance: rateLimitInstance,
    limits: {
      login: { requests: 5, window: '5 m' },
      register: { requests: 3, window: '10 m' },
      passwordReset: { requests: 3, window: '15 m' },
    },
  };
}

// レート制限の実行とヘッダー設定
export async function executeRateLimit(
  rateLimit: Ratelimit | null,
  identifier: string
): Promise<{
  success: boolean;
  headers: Record<string, string>;
  reset?: number;
}> {
  if (!rateLimit) {
    // レート制限が無効の場合は常に成功
    return {
      success: true,
      headers: {},
    };
  }

  try {
    const { success, limit, reset, remaining } = await rateLimit.limit(identifier);

    const headers: Record<string, string> = {
      'X-RateLimit-Limit': limit.toString(),
      'X-RateLimit-Remaining': remaining.toString(),
      'X-RateLimit-Reset': reset.toString(),
    };

    if (!success) {
      headers['Retry-After'] = Math.round((reset - Date.now()) / 1000).toString();
    }

    return {
      success,
      headers,
      reset,
    };
  } catch (error) {
    console.error('レート制限の実行に失敗しました:', error);
    
    // Redis接続エラーの場合、本番環境では厳格に、開発環境では通す
    if (process.env.NODE_ENV === 'production') {
      return {
        success: false,
        headers: {},
      };
    } else {
      console.warn('⚠️ 開発環境: Redis接続エラーのため、レート制限をスキップします');
      return {
        success: true,
        headers: {},
      };
    }
  }
}

// IP アドレスの取得（プロキシ対応）
export function getClientIP(request: Request): string {
  // VercelなどのホスティングサービスでのIP取得
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  const cfConnectingIP = request.headers.get('cf-connecting-ip'); // Cloudflare

  if (cfConnectingIP) {
    return cfConnectingIP;
  }

  if (realIP) {
    return realIP;
  }

  if (forwarded) {
    // X-Forwarded-Forは複数のIPが含まれる可能性があるため、最初のIPを使用
    const firstIP = forwarded.split(',')[0].trim();
    return firstIP;
  }

  // フォールバック
  return '127.0.0.1';
}

// レート制限のテスト用ヘルパー
export function createTestRateLimit(): Ratelimit | null {
  if (process.env.NODE_ENV === 'test') {
    // テスト環境では常にnullを返す（レート制限無効）
    return null;
  }

  // テスト用のin-memoryレート制限
  try {
    return new Ratelimit({
      redis: {
        // メモリ内のRedisモック
        eval: async () => ({ result: [1, Date.now() + 300000] }),
      } as any,
      limiter: Ratelimit.slidingWindow(10, '1 m'), // テスト用に緩い制限
    });
  } catch {
    return null;
  }
}

// 設定状況の診断レポート
export function generateRateLimitDiagnostics(): {
  status: 'ok' | 'warning' | 'error';
  message: string;
  details: any;
} {
  const validation = validateRateLimitEnvironment();
  const config = createRateLimitInstance();

  if (process.env.NODE_ENV === 'production') {
    if (!validation.isValid) {
      return {
        status: 'error',
        message: '本番環境でレート制限設定が不完全です',
        details: {
          missing: validation.missing,
          warnings: validation.warnings,
          enabled: config.enabled,
        },
      };
    }

    if (!config.enabled) {
      return {
        status: 'error',
        message: 'レート制限の初期化に失敗しました',
        details: {
          validation,
          config,
        },
      };
    }

    return {
      status: 'ok',
      message: 'レート制限が正常に設定されています',
      details: {
        enabled: config.enabled,
        limits: config.limits,
        warnings: validation.warnings,
      },
    };
  } else {
    // 開発/テスト環境
    return {
      status: validation.isValid ? 'ok' : 'warning',
      message: validation.isValid 
        ? 'レート制限が設定されています（開発環境）'
        : 'レート制限が無効です（開発環境）',
      details: {
        validation,
        config,
        note: '開発環境ではレート制限は必須ではありません',
      },
    };
  }
}