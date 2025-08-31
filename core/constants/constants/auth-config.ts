// 認証関連の設定定数

/**
 * Bearer token認証に関する設定
 */
export const AUTH_CONFIG = {
  /** Bearerトークンのプレフィックス */
  BEARER_PREFIX: "Bearer ",

  /** Bearerプレフィックスの文字数（"Bearer ".length） */
  BEARER_PREFIX_LENGTH: 7,
} as const;
