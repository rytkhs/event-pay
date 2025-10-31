/**
 * GA4 Event Type Definitions
 *
 * Google Analytics 4のイベント型定義
 * 型安全なイベント送信を可能にする統合型システム
 */

/**
 * GA4で使用するイベント名の型定義
 */
export type GA4EventName =
  | "page_view"
  | "sign_up"
  | "login"
  | "logout"
  | "event_created"
  | "event_registration"
  | "invite_shared"
  | "begin_checkout"
  | "purchase"
  | "exception";

/**
 * 基本イベントパラメータ
 */
export interface BaseEventParams {
  /** イベントカテゴリ */
  event_category?: string;
  /** イベントラベル */
  event_label?: string;
  /** イベント値 */
  value?: number;
}

/**
 * サインアップイベントのパラメータ
 */
export interface SignUpEventParams extends BaseEventParams {
  /** 認証方法 */
  method: "email" | "social";
}

/**
 * ログインイベントのパラメータ
 */
export interface LoginEventParams extends BaseEventParams {
  /** 認証方法 */
  method: "email" | "social";
}

/**
 * イベント作成イベントのパラメータ
 */
export interface EventCreatedParams extends BaseEventParams {
  /** イベントID */
  event_id: string;
  /** イベントタイトル */
  event_title: string;
  /** イベント日付 */
  event_date: string;
  /** 金額 */
  amount: number;
  /** 通貨 */
  currency: "JPY";
}

/**
 * イベント参加登録のパラメータ
 */
export interface EventRegistrationParams extends BaseEventParams {
  /** イベントID */
  event_id: string;
}

/**
 * 招待共有イベントのパラメータ
 */
export interface InviteSharedParams extends BaseEventParams {
  /** イベントID */
  event_id: string;
}

/**
 * チェックアウト開始イベントのパラメータ
 */
export interface BeginCheckoutParams extends BaseEventParams {
  /** イベントID */
  event_id: string;
  /** 通貨 */
  currency: "JPY";
  /** 金額 */
  value: number;
  /** 商品アイテム */
  items: Array<{
    /** アイテムID */
    item_id: string;
    /** アイテム名 */
    item_name: string;
    /** 価格 */
    price: number;
    /** 数量 */
    quantity: number;
  }>;
}

/**
 * 購入完了イベントのパラメータ
 */
export interface PurchaseParams extends BaseEventParams {
  /** トランザクションID */
  transaction_id: string;
  /** イベントID */
  event_id: string;
  /** 通貨 */
  currency: "JPY";
  /** 金額 */
  value: number;
  /** 商品アイテム */
  items: Array<{
    /** アイテムID */
    item_id: string;
    /** アイテム名 */
    item_name: string;
    /** 価格 */
    price: number;
    /** 数量 */
    quantity: number;
  }>;
}

/**
 * 例外/エラーイベントのパラメータ
 */
export interface ExceptionParams {
  /** エラーの説明 */
  description: string;
  /** 致命的なエラーかどうか */
  fatal: boolean;
}

/**
 * GA4イベント送信用の統合型
 * 型安全なイベント送信を保証する
 */
export type GA4Event =
  | { name: "sign_up"; params: SignUpEventParams }
  | { name: "login"; params: LoginEventParams }
  | { name: "logout"; params: BaseEventParams }
  | { name: "event_created"; params: EventCreatedParams }
  | { name: "event_registration"; params: EventRegistrationParams }
  | { name: "invite_shared"; params: InviteSharedParams }
  | { name: "begin_checkout"; params: BeginCheckoutParams }
  | { name: "purchase"; params: PurchaseParams }
  | { name: "exception"; params: ExceptionParams };

/**
 * イベントパラメータの型ガード関数
 */
export function isSignUpEvent(
  event: GA4Event
): event is { name: "sign_up"; params: SignUpEventParams } {
  return event.name === "sign_up";
}

export function isLoginEvent(
  event: GA4Event
): event is { name: "login"; params: LoginEventParams } {
  return event.name === "login";
}

export function isEventCreatedEvent(
  event: GA4Event
): event is { name: "event_created"; params: EventCreatedParams } {
  return event.name === "event_created";
}

export function isBeginCheckoutEvent(
  event: GA4Event
): event is { name: "begin_checkout"; params: BeginCheckoutParams } {
  return event.name === "begin_checkout";
}

export function isPurchaseEvent(
  event: GA4Event
): event is { name: "purchase"; params: PurchaseParams } {
  return event.name === "purchase";
}

export function isExceptionEvent(
  event: GA4Event
): event is { name: "exception"; params: ExceptionParams } {
  return event.name === "exception";
}
