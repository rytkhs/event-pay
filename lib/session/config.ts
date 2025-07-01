/**
 * セッション管理設定
 * 循環import回避のため設定を分離
 */
export const SESSION_CONFIG = {
  updateAge: 60 * 60, // 1時間（秒）- AUTH_CONFIGと同じ値
  refreshThreshold: {
    high: 5 * 60, // 5分以内
    medium: 15 * 60, // 15分以内
    low: 30 * 60, // 30分以内
  },
} as const;

export type SessionUpdatePriority = "high" | "medium" | "low" | "none";