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
 * GA4イベントパラメータの値型
 *
 * GA4仕様に準拠した型制約により、コンパイル時に型エラーを検出します。
 * 許可される値の型: string, number, boolean, undefined
 *
 * @example
 * ```typescript
 * const validValue: GA4ParamValue = "text"; // OK
 * const validNumber: GA4ParamValue = 123; // OK
 * const validBoolean: GA4ParamValue = true; // OK
 * const invalidValue: GA4ParamValue = { nested: "object" }; // コンパイルエラー
 * ```
 */
export type GA4ParamValue = string | number | boolean | undefined;

/**
 * GA4イベントパラメータ
 * 厳密な型制約により、GA4仕様への準拠を保証
 */
export interface GA4EventParams {
  [key: string]: GA4ParamValue | GA4ParamValue[] | Record<string, GA4ParamValue>;
}

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
  /** イベントコールバック（クライアント側のみ） */
  event_callback?: () => void;
}

/**
 * 認証方法の型定義
 * GA4推奨イベントのmethodパラメータで使用
 */
export type AuthMethod = "password" | "google" | "github" | string;

/**
 * サインアップイベントのパラメータ
 */
export interface SignUpEventParams extends BaseEventParams {
  /** 認証方法 */
  method: AuthMethod;
}

/**
 * ログインイベントのパラメータ
 */
export interface LoginEventParams extends BaseEventParams {
  /** 認証方法 */
  method: AuthMethod;
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
 *
 * 型安全なイベント送信を保証します。
 * 各イベント名に対して適切なパラメータ型が強制されます。
 *
 * @example
 * ```typescript
 * // 正しい型の使用
 * const event: GA4Event = {
 *   name: 'purchase',
 *   params: {
 *     transaction_id: 'T12345',
 *     event_id: 'E123',
 *     currency: 'JPY',
 *     value: 99.99,
 *     items: [{ item_id: 'I1', item_name: 'Item', price: 99.99, quantity: 1 }],
 *   },
 * };
 *
 * // 型エラー: purchaseイベントにはtransaction_idが必須
 * const invalidEvent: GA4Event = {
 *   name: 'purchase',
 *   params: { value: 99.99 }, // コンパイルエラー
 * };
 * ```
 */
/**
 * イベント名とパラメータ型のマッピング
 */
type EventMap = {
  sign_up: SignUpEventParams;
  login: LoginEventParams;
  logout: BaseEventParams;
  event_created: EventCreatedParams;
  event_registration: EventRegistrationParams;
  invite_shared: InviteSharedParams;
  begin_checkout: BeginCheckoutParams;
  purchase: PurchaseParams;
  exception: ExceptionParams;
};

/**
 * GA4イベント送信用の統合型
 *
 * 型安全なイベント送信を保証します。
 * 各イベント名に対して適切なパラメータ型が強制されます。
 *
 * @example
 * ```typescript
 * // 正しい型の使用
 * const event: GA4Event = {
 *   name: 'purchase',
 *   params: {
 *     transaction_id: 'T12345',
 *     event_id: 'E123',
 *     currency: 'JPY',
 *     value: 99.99,
 *     items: [{ item_id: 'I1', item_name: 'Item', price: 99.99, quantity: 1 }],
 *   },
 * };
 *
 * // 型エラー: purchaseイベントにはtransaction_idが必須
 * const invalidEvent: GA4Event = {
 *   name: 'purchase',
 *   params: { value: 99.99 }, // コンパイルエラー
 * };
 * ```
 */
export type GA4Event = {
  [K in keyof EventMap]: {
    name: K;
    params: EventMap[K];
  };
}[keyof EventMap];

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
