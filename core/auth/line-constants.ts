/**
 * LINE Login 定数定義
 */

// LINE API エンドポイント
export const LINE_API = {
  AUTHORIZE: "https://access.line.me/oauth2/v2.1/authorize",
  TOKEN: "https://api.line.me/oauth2/v2.1/token",
  VERIFY: "https://api.line.me/oauth2/v2.1/verify",
} as const;

// Cookie名
export const LINE_OAUTH_COOKIES = {
  STATE: "line_oauth_state",
  NEXT: "line_oauth_next",
  CODE_VERIFIER: "line_oauth_code_verifier",
} as const;

// タイムアウト設定
export const LINE_OAUTH_CONFIG = {
  STATE_COOKIE_MAX_AGE: 60 * 10, // 10分
  SCOPE: "profile openid email",
  CODE_CHALLENGE_METHOD: "S256", // LINEはS256のみサポート
} as const;

// エラーコード
export const LINE_ERROR_CODES = {
  CONFIG_ERROR: "line_config_error",
  AUTH_FAILED: "line_auth_failed",
  STATE_MISMATCH: "line_state_mismatch",
  TOKEN_FAILED: "line_token_failed",
  EMAIL_REQUIRED: "line_email_required",
  SERVER_ERROR: "line_server_error",
} as const;
