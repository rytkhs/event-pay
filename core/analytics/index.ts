/**
 * GA4 Analytics Module
 *
 * GA4アナリティクス機能のエクスポートモジュール
 *
 * このモジュールは、クライアント側とサーバー側の両方でGA4イベントを送信するための
 * 包括的なユーティリティを提供します。
 *
 * 主な機能:
 * - タイムアウト処理（クライアント側）
 * - リトライロジック（サーバー側）
 * - パラメータ検証とサニタイズ
 * - 型安全なイベント送信
 * - 統一されたエラーハンドリング
 *
 * @example
 * ```typescript
 * // クライアント側
 * import { ga4Client } from '@core/analytics';
 * ga4Client.sendEvent({ name: 'page_view', params: {} });
 *
 * // サーバー側
 * import { ga4Server } from '@core/analytics';
 * await ga4Server.sendEvent(event, clientId);
 * ```
 */

// 設定
// 環境変数からGA4設定を取得し、有効/無効を判定
export { getGA4Config, isGA4Enabled, isMeasurementProtocolAvailable } from "./config";
export type { GA4Config } from "./config";

// イベント型定義
// 型安全なイベント送信を保証する型定義
export type {
  GA4EventName,
  GA4Event,
  BaseEventParams,
  SignUpEventParams,
  LoginEventParams,
  EventCreatedParams,
  EventRegistrationParams,
  InviteSharedParams,
  BeginCheckoutParams,
  PurchaseParams,
  ExceptionParams,
} from "./event-types";

// イベント型ガード関数
export {
  isSignUpEvent,
  isLoginEvent,
  isEventCreatedEvent,
  isBeginCheckoutEvent,
  isPurchaseEvent,
  isExceptionEvent,
} from "./event-types";

// エラーハンドリング
// GA4関連のエラーを統一的に扱うカスタムエラークラス
export { GA4Error, GA4ErrorCode } from "./ga4-error";
export type { GA4ErrorCodeType } from "./ga4-error";

// バリデーション
// Client IDとイベントパラメータの検証・サニタイズユーティリティ
export { GA4Validator } from "./ga4-validator";
export type { ValidationResult } from "./ga4-validator";

// クライアント側サービス
// ブラウザでのGA4イベント送信（タイムアウト処理付き）
export { GA4ClientService, ga4Client } from "./ga4-client";

// サーバー側サービス
// Measurement Protocol APIを使用したサーバー側イベント送信（リトライ付き）
export { GA4ServerService, ga4Server } from "./ga4-server";
