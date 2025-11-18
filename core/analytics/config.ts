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
 * 環境変数から動的に設定を読み込みます。
 * - `NEXT_PUBLIC_GA_MEASUREMENT_ID`: GA4 Measurement ID
 * - `GA_API_SECRET`: Measurement Protocol API Secret（サーバー側のみ）
 * - テスト環境では自動的に無効化されます
 * - 開発環境ではデバッグモードが有効になります
 *
 * @returns GA4Config オブジェクト
 *
 * @example
 * ```typescript
 * const config = getGA4Config();
 * console.log('GA4 Enabled:', config.enabled);
 * console.log('Measurement ID:', config.measurementId);
 * ```
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
 * Measurement IDが設定されており、かつテスト環境でない場合にtrueを返します。
 *
 * @returns boolean GA4が有効な場合はtrue
 *
 * @example
 * ```typescript
 * if (isGA4Enabled()) {
 *   // GA4が有効な場合の処理
 * }
 * ```
 */
export function isGA4Enabled(): boolean {
  return getGA4Config().enabled;
}

/**
 * Measurement Protocol APIが利用可能かどうかを判定する
 *
 * GA4が有効で、かつAPI Secretが設定されている場合にtrueを返します。
 * サーバー側でのイベント送信が可能かどうかを確認するために使用します。
 *
 * @returns boolean API Secretが設定されている場合はtrue
 *
 * @example
 * ```typescript
 * if (isMeasurementProtocolAvailable()) {
 *   // サーバー側イベント送信が可能
 *   await ga4Server.sendEvent(event, clientId);
 * }
 * ```
 */
export function isMeasurementProtocolAvailable(): boolean {
  const config = getGA4Config();
  return config.enabled && !!config.apiSecret;
}
