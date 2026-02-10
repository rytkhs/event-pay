// イベント関連の設定定数

/**
 * イベントステータス自動更新に関する設定
 */
export const EVENT_CONFIG = {
  /** イベント自動終了時間（時間） */
  AUTO_END_HOURS: 24,

  /** ステータス更新対象のステータス */
  UPDATABLE_STATUSES: ["upcoming", "ongoing"] as const,
} as const;

/**
 * 時間計算に関する定数
 */
export const TIME_CONSTANTS = {
  /** ミリ秒から時間への変換係数 */
  MS_TO_HOURS: 1000 * 60 * 60,

  /** ミリ秒から日への変換係数 */
  MS_TO_DAYS: 1000 * 60 * 60 * 24,
} as const;
