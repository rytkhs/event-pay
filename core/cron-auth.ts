// Cron API認証ロジック

import "server-only";

import { AUTH_CONFIG } from "@core/constants/auth-config";
import { logger } from "@core/logging/app-logger";
import { getEnv } from "@core/utils/cloudflare-env";

interface AuthResult {
  isValid: boolean;
  error?: string;
}

interface RequestWithHeaders {
  headers: {
    get: (key: string) => string | null;
  };
  // NextRequest互換: ランタイムで存在する可能性がある
  url?: string;
  nextUrl?: { searchParams: URLSearchParams };
}

/**
 * Cron APIリクエストの認証を検証
 */
export function validateCronSecret(request: RequestWithHeaders): AuthResult {
  // 環境変数からCRON_SECRETを取得
  const expectedSecret = getEnv().CRON_SECRET;
  if (!expectedSecret) {
    return {
      isValid: false,
      error: "CRON_SECRET not configured",
    };
  }

  // 優先順でトークンを取得: Authorization Bearer -> x-cron-secret ヘッダー -> ?secret= クエリ
  let token: string | null = null;

  // 1) Authorization: Bearer <token>
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    if (!authHeader.startsWith(AUTH_CONFIG.BEARER_PREFIX)) {
      return {
        isValid: false,
        error: "Invalid Authorization format (expected Bearer token)",
      };
    }
    token = authHeader.slice(AUTH_CONFIG.BEARER_PREFIX_LENGTH);
  }

  // 2) X-Cron-Secret: <token>
  if (!token) {
    const headerToken = request.headers.get("x-cron-secret");
    if (headerToken) token = headerToken;
  }

  // 3) ?secret=<token>
  if (!token) {
    try {
      if (request.nextUrl) {
        token = request.nextUrl.searchParams.get("secret");
      } else if (request.url) {
        const url = new URL(request.url);
        token = url.searchParams.get("secret");
      }
    } catch {
      // URL解析に失敗した場合は無視
    }
  }

  if (!token) {
    return {
      isValid: false,
      error: "Missing Authorization header",
    };
  }

  // トークンが期待値と一致するかチェック
  if (token !== expectedSecret) {
    return {
      isValid: false,
      error: "Invalid CRON_SECRET",
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
  _type: "success" | "error" | "info" | "warning",
  _message: string,
  _details?: Record<string, unknown>
): void {
  // _details は任意のメタ情報を付加するためのオブジェクト
  const fields = {
    category: "system",
    action: "cron_activity",
    actor_type: "system",
    outcome: (_type === "error" ? "failure" : "success") as any,
    ...(_details || {}),
  } as const;

  switch (_type) {
    case "success":
    case "info":
      logger.info(_message, fields);
      break;
    case "warning":
      logger.warn(_message, fields);
      break;
    case "error":
      logger.error(_message, fields);
      break;
    default:
      logger.debug(_message, fields);
  }
}
