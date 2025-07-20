// Cron API認証ロジック

import { AUTH_CONFIG } from '@/lib/constants/auth-config';

interface AuthResult {
  isValid: boolean;
  error?: string;
}

interface RequestWithHeaders {
  headers: {
    get: (key: string) => string | null;
  };
}

/**
 * Cron APIリクエストの認証を検証
 */
export function validateCronSecret(request: RequestWithHeaders): AuthResult {
  // 環境変数からCRON_SECRETを取得
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    return {
      isValid: false,
      error: 'CRON_SECRET not configured',
    };
  }

  // AuthorizationヘッダーからBearer トークンを取得
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return {
      isValid: false,
      error: 'Missing Authorization header',
    };
  }

  // Bearer形式かチェック
  if (!authHeader.startsWith(AUTH_CONFIG.BEARER_PREFIX)) {
    return {
      isValid: false,
      error: 'Invalid Authorization format (expected Bearer token)',
    };
  }

  // トークンを抽出
  const token = authHeader.slice(AUTH_CONFIG.BEARER_PREFIX_LENGTH);

  // トークンが期待値と一致するかチェック
  if (token !== expectedSecret) {
    return {
      isValid: false,
      error: 'Invalid CRON_SECRET',
    };
  }

  return {
    isValid: true,
  };
}

/**
 * ログ出力用ヘルパー
 */
export function logCronActivity(
  type: 'success' | 'error' | 'info' | 'warning',
  message: string,
  details?: Record<string, unknown>
): void {
  const timestamp = new Date().toISOString();
  const logData = {
    timestamp,
    type,
    message,
    ...details,
  };

  if (type === 'error') {
    console.error('[CRON]', JSON.stringify(logData));
  } else if (type === 'info') {
    console.info('[CRON]', JSON.stringify(logData));
  } else if (type === 'warning') {
    console.warn('[CRON]', JSON.stringify(logData));
  } else {
    console.log('[CRON]', JSON.stringify(logData));
  }
}