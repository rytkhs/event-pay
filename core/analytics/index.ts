/**
 * GA4 Analytics Module
 *
 * GA4アナリティクス機能のエクスポートモジュール
 */

// 設定
export { getGA4Config, isGA4Enabled, isMeasurementProtocolAvailable } from "./config";
export type { GA4Config } from "./config";

// イベント型定義
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

export {
  isSignUpEvent,
  isLoginEvent,
  isEventCreatedEvent,
  isBeginCheckoutEvent,
  isPurchaseEvent,
  isExceptionEvent,
} from "./event-types";

// クライアント側サービス
export { GA4ClientService, ga4Client } from "./ga4-client";

// サーバー側サービス
export { GA4ServerService, ga4Server } from "./ga4-server";
