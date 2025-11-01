/**
 * GA4 Analytics Configuration
 *
 * Google Analytics 4の設定管理モジュール
 * 環境変数からMeasurement IDとAPI Secretを読み込み、
 * 有効/無効の判定ロジックを提供する
 */

export interface GA4Config {
  /** GA4 Measurement ID (G-で始まる識別子) */
  measurementId: string;
  /** Measurement Protocol API Secret (サーバー側イベント送信用) */
  apiSecret?: string;
  /** GA4が有効かどうか */
  enabled: boolean;
  /** デバッグモードかどうか */
  debug: boolean;
}

/**
 * GA4設定を取得する
 *
 * @returns GA4Config オブジェクト
 */
export function getGA4Config(): GA4Config {
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "";
  const apiSecret = process.env.GA_API_SECRET;

  // テスト環境では無効化、Measurement IDが設定されている場合のみ有効
  const enabled = !!measurementId && process.env.NODE_ENV !== "test";

  // 開発環境ではデバッグモードを有効化
  const debug = process.env.NODE_ENV === "development";

  return {
    measurementId,
    apiSecret,
    enabled,
    debug,
  };
}

/**
 * GA4が有効かどうかを判定する
 *
 * @returns boolean GA4が有効な場合はtrue
 */
export function isGA4Enabled(): boolean {
  return getGA4Config().enabled;
}

/**
 * Measurement Protocol APIが利用可能かどうかを判定する
 *
 * @returns boolean API Secretが設定されている場合はtrue
 */
export function isMeasurementProtocolAvailable(): boolean {
  const config = getGA4Config();
  return config.enabled && !!config.apiSecret;
}
