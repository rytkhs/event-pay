これらのユーティリティをベストプラクティスも踏まえてレビューして。next.js 14です。

#### core/analytics/config.ts
```
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
```

#### core/analytics/event-types.ts
```
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
```

#### core/analytics/ga4-client.ts
```
/**
 * GA4 Client-Side Analytics Service
 *
 * クライアント側でのGA4イベント送信を管理するサービス
 * @next/third-partiesのsendGAEventをラップし、型安全なイベント送信を提供
 */

"use client";

import { sendGAEvent } from "@next/third-parties/google";

import { getGA4Config } from "./config";
import type { GA4Event } from "./event-types";
import { GA4Validator } from "./ga4-validator";

/**
 * GA4クライアント側サービスクラス
 */
export class GA4ClientService {
  /**
   * 設定を動的に取得する
   * 環境変数の変更を即座に反映するため、getterとして実装
   */
  private get config() {
    return getGA4Config();
  }

  /**
   * カスタムイベントを送信する
   *
   * GA4が無効な場合は送信をスキップします。
   * デバッグモードが有効な場合は、送信内容をコンソールに出力します。
   *
   * @param event - 送信するGA4イベント
   *
   * @example
   * ```typescript
   * ga4Client.sendEvent({
   *   name: 'page_view',
   *   params: {
   *     page_title: 'Home',
   *     page_location: window.location.href,
   *   },
   * });
   * ```
   */
  sendEvent(event: GA4Event): void {
    if (!this.config.enabled) {
      if (this.config.debug) {
        console.log("[GA4] Event skipped (disabled):", event);
      }
      return;
    }

    try {
      sendGAEvent(event.name, event.params);

      if (this.config.debug) {
        console.log("[GA4] Event sent:", event);
      }
    } catch (error) {
      console.error("[GA4] Failed to send event:", error);
    }
  }

  /**
   * GA4 Client IDを取得する（Stripe決済用）
   *
   * タイムアウト処理とClient ID検証を含みます。
   * Client IDは `数字10桁.数字10桁` の形式で検証されます。
   * タイムアウトまたは検証失敗時はnullを返します。
   *
   * @param timeoutMs - タイムアウト時間（ミリ秒）、デフォルトは3000ms
   * @returns Promise<string | null> Client ID、取得できない場合はnull
   *
   * @example
   * ```typescript
   * // デフォルトタイムアウト（3000ms）
   * const clientId = await ga4Client.getClientId();
   * if (clientId) {
   *   console.log('Client ID:', clientId);
   * }
   *
   * // カスタムタイムアウト
   * const clientId = await ga4Client.getClientId(5000);
   * ```
   */
  async getClientId(timeoutMs: number = 3000): Promise<string | null> {
    if (!this.config.enabled) {
      if (this.config.debug) {
        console.log("[GA4] Client ID request skipped (disabled)");
      }
      return null;
    }

    return new Promise((resolve) => {
      let resolved = false;

      // 二重解決を防ぐsafeResolveパターン
      const safeResolve = (value: string | null) => {
        if (!resolved) {
          resolved = true;
          resolve(value);
        }
      };

      // タイムアウト設定
      const timeoutId = setTimeout(() => {
        if (this.config.debug) {
          console.log("[GA4] Client ID retrieval timed out");
        }
        safeResolve(null);
      }, timeoutMs);

      if (typeof window === "undefined" || !window.gtag) {
        clearTimeout(timeoutId);
        if (this.config.debug) {
          console.log("[GA4] gtag not available, returning null");
        }
        safeResolve(null);
        return;
      }

      try {
        window.gtag("get", this.config.measurementId, "client_id", (clientId: string) => {
          clearTimeout(timeoutId);

          // Client ID検証
          const validation = GA4Validator.validateClientId(clientId);
          if (!validation.isValid) {
            if (this.config.debug) {
              console.log("[GA4] Invalid client ID received:", validation.errors);
            }
            safeResolve(null);
            return;
          }

          if (this.config.debug) {
            console.log("[GA4] Client ID retrieved:", clientId);
          }
          safeResolve(clientId);
        });
      } catch (error) {
        clearTimeout(timeoutId);
        console.error("[GA4] Failed to get client ID:", error);
        safeResolve(null);
      }
    });
  }

  /**
   * イベント送信後にコールバックを実行する
   *
   * タイムアウト処理とコールバック二重実行防止を含みます。
   * GA4が無効な場合でも、コールバックは必ず実行されます。
   * タイムアウト時間内にGA4からの応答がない場合、自動的にコールバックを実行します。
   *
   * @param event - 送信するGA4イベント
   * @param callback - イベント送信後に実行するコールバック関数
   * @param timeoutMs - タイムアウト時間（ミリ秒）、デフォルトは2000ms
   *
   * @example
   * ```typescript
   * // デフォルトタイムアウト（2000ms）
   * ga4Client.sendEventWithCallback(
   *   {
   *     name: 'purchase',
   *     params: {
   *       transaction_id: 'T12345',
   *       value: 99.99,
   *       currency: 'JPY',
   *     },
   *   },
   *   () => {
   *     console.log('イベント送信完了');
   *     // 次の処理へ進む
   *   }
   * );
   *
   * // カスタムタイムアウト
   * ga4Client.sendEventWithCallback(event, callback, 3000);
   * ```
   */
  sendEventWithCallback(event: GA4Event, callback: () => void, timeoutMs: number = 2000): void {
    if (!this.config.enabled) {
      if (this.config.debug) {
        console.log("[GA4] Event with callback skipped (disabled):", event);
      }
      // GA4が無効でも、コールバックは実行する
      callback();
      return;
    }

    let callbackExecuted = false;

    // コールバック二重実行を防ぐsafeCallbackパターン
    const safeCallback = () => {
      if (!callbackExecuted) {
        callbackExecuted = true;
        callback();
      }
    };

    // タイムアウト設定
    const timeoutId = setTimeout(() => {
      if (this.config.debug) {
      }
      safeCallback();
    }, timeoutMs);

    try {
      // event_callbackパラメータを追加してイベントを送信
      const eventWithCallback = {
        ...event,
        params: {
          ...event.params,
          event_callback: () => {
            clearTimeout(timeoutId);
            safeCallback();
          },
        },
      };

      sendGAEvent(eventWithCallback.name, eventWithCallback.params);

      if (this.config.debug) {
      }
    } catch (error) {
      clearTimeout(timeoutId);
      console.error("[GA4] Failed to send event with callback:", error);
      // エラーが発生してもコールバックは実行する
      safeCallback();
    }
  }

  /**
   * GA4が有効かどうかを確認する
   *
   * 環境変数 `NEXT_PUBLIC_GA4_ENABLED` の値を動的に取得します。
   *
   * @returns boolean GA4が有効な場合はtrue
   *
   * @example
   * ```typescript
   * if (ga4Client.isEnabled()) {
   *   // GA4が有効な場合の処理
   * }
   * ```
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * デバッグモードかどうかを確認する
   *
   * 環境変数 `NEXT_PUBLIC_GA4_DEBUG` の値を動的に取得します。
   * デバッグモードが有効な場合、詳細なログが出力されます。
   *
   * @returns boolean デバッグモードの場合はtrue
   *
   * @example
   * ```typescript
   * if (ga4Client.isDebugMode()) {
   *   console.log('GA4 debug mode is enabled');
   * }
   * ```
   */
  isDebugMode(): boolean {
    return this.config.debug;
  }
}

// シングルトンインスタンス
export const ga4Client = new GA4ClientService();

// gtag関数の型定義を拡張
declare global {
  interface Window {
    gtag?: (
      command: "get" | "config" | "event",
      targetId: string,
      config?: string | object,
      callback?: (value: string) => void
    ) => void;
  }
}
```

#### core/analytics/ga4-error.ts
```
/**
 * GA4 Analytics Error Handling
 *
 * Custom error class for GA4-related errors with structured error codes and context.
 */

/**
 * GA4 error codes for categorizing different types of errors
 */
export const GA4ErrorCode = {
  TIMEOUT: "GA4_TIMEOUT",
  INVALID_CLIENT_ID: "GA4_INVALID_CLIENT_ID",
  INVALID_PARAMETER: "GA4_INVALID_PARAMETER",
  API_ERROR: "GA4_API_ERROR",
  RETRY_EXHAUSTED: "GA4_RETRY_EXHAUSTED",
  CONFIGURATION_ERROR: "GA4_CONFIGURATION_ERROR",
} as const;

export type GA4ErrorCodeType = (typeof GA4ErrorCode)[keyof typeof GA4ErrorCode];

/**
 * Custom error class for GA4 analytics operations
 *
 * @example
 * ```typescript
 * throw new GA4Error(
 *   "Client ID validation failed",
 *   GA4ErrorCode.INVALID_CLIENT_ID,
 *   { clientId: "invalid-id" }
 * );
 * ```
 */
export class GA4Error extends Error {
  /**
   * Creates a new GA4Error instance
   *
   * @param message - Human-readable error message
   * @param code - Error code from GA4ErrorCode constants
   * @param context - Optional additional context about the error
   */
  constructor(
    message: string,
    public readonly code: GA4ErrorCodeType,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "GA4Error";

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GA4Error);
    }
  }
}
```

#### core/analytics/ga4-server.ts
```
/**
 * GA4 Server-Side Analytics Service
 *
 * サーバー側でのGA4イベント送信を管理するサービス
 * Measurt Protocol APIを使用してサーバーからGA4にイベントを送信
 */

import "server-only";

import { logger } from "@core/logging/app-logger";

import { getGA4Config } from "./config";
import type { GA4Event } from "./event-types";
import { GA4Error, GA4ErrorCode } from "./ga4-error";
import { GA4Validator } from "./ga4-validator";

/**
 * GA4サーバー側サービスクラス
 */
export class GA4ServerService {
  private readonly MEASUREMENT_PROTOCOL_URL = "https://www.google-analytics.com/mp/collect";
  private readonly MAX_RETRIES = 3;
  private readonly MAX_RETRY_DELAY = 10000;
  private readonly MAX_JITTER = 1000;
  private readonly MAX_EVENTS_PER_BATCH = 25;

  /**
   * 設定を動的に取得するgetter
   */
  private get config() {
    return getGA4Config();
  }

  /**
   * コンストラクタ
   *
   * 依存性注入をサポートし、テスト時にモックfetchを使用できます。
   *
   * @param fetcher - fetch関数（依存性注入用、テスト時にモック可能）
   *
   * @example
   * ```typescript
   * // デフォルトのfetchを使用
   * const service = new GA4ServerService();
   *
   * // テスト用にモックfetchを注入
   * const mockFetch = jest.fn();
   * const testService = new GA4ServerService(mockFetch);
   * ```
   */
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  /**
   * サーバー側からイベントを送信する（Measurement Protocol）
   *
   * Client IDとイベントパラメータの検証を自動的に実行します。
   * 5xxエラーの場合は自動的にリトライします（最大3回、指数バックオフ）。
   * Client IDまたはUser IDのいずれかが必須です。
   *
   * @param event - 送信するGA4イベント
   * @param clientId - GA4 Client ID（オプショナル、_ga Cookieから取得した値）
   * @param userId - ユーザーID（オプショナル、clientIdがない場合のフォールバック）
   * @param sessionId - セッションID（オプショナル、正の整数）
   * @param engagementTimeMsec - エンゲージメント時間（ミリ秒、オプショナル）
   *
   * @example
   * ```typescript
   * // Client IDを使用
   * await ga4Server.sendEvent(
   *   {
   *     name: 'purchase',
   *     params: {
   *       transaction_id: 'T12345',
   *       value: 99.99,
   *       currency: 'JPY',
   *     },
   *   },
   *   '1234567890.0987654321'
   * );
   *
   * // User IDとセッション情報を使用
   * await ga4Server.sendEvent(
   *   event,
   *   undefined,
   *   'user123',
   *   1234567890,
   *   5000
   * );
   * ```
   */
  async sendEvent(
    event: GA4Event,
    clientId?: string,
    userId?: string,
    sessionId?: number,
    engagementTimeMsec?: number
  ): Promise<void> {
    if (!this.config.enabled || !this.config.apiSecret) {
      logger.debug("[GA4] Server event skipped (disabled or no API secret)", {
        tag: "ga4-server",
        event_name: event.name,
        client_id: clientId,
        user_id: userId,
      });
      return;
    }

    // Client ID検証（GA4Validator使用）
    let validClientId: string | null = null;
    if (clientId) {
      const validation = GA4Validator.validateClientId(clientId);
      if (validation.isValid) {
        validClientId = clientId;
      } else if (this.config.debug) {
        logger.debug("[GA4] Invalid client ID", {
          tag: "ga4-server",
          client_id: clientId,
          errors: validation.errors,
        });
      }
    }

    // Client IDもUserIdもない場合は送信できない
    if (!validClientId && !userId) {
      logger.warn("[GA4] Neither valid client ID nor user ID provided", {
        tag: "ga4-server",
        client_id: clientId,
        user_id: userId,
        event_name: event.name,
      });
      return;
    }

    // パラメータ検証とサニタイズ（GA4Validator使用）
    const paramValidation = GA4Validator.validateAndSanitizeParams(
      event.params as Record<string, unknown>,
      this.config.debug
    );

    // sanitizedParamsが存在しない、または元のパラメータが空でないのにサニタイズ後が空の場合はエラー
    if (
      !paramValidation.sanitizedParams ||
      (Object.keys(event.params).length > 0 &&
        Object.keys(paramValidation.sanitizedParams).length === 0)
    ) {
      logger.warn("[GA4] Event parameters validation failed", {
        tag: "ga4-server",
        event_name: event.name,
        original_param_count: Object.keys(event.params).length,
        sanitized_param_count: paramValidation.sanitizedParams
          ? Object.keys(paramValidation.sanitizedParams).length
          : 0,
        errors: paramValidation.errors,
      });
      return;
    }

    const url = `${this.MEASUREMENT_PROTOCOL_URL}?measurement_id=${this.config.measurementId}&api_secret=${this.config.apiSecret}`;

    // 検証済みパラメータに共通パラメータを追加
    const eventParams: Record<string, unknown> = { ...paramValidation.sanitizedParams };
    if (sessionId !== undefined && sessionId > 0) {
      eventParams.session_id = sessionId;
    }
    if (engagementTimeMsec !== undefined && engagementTimeMsec >= 0) {
      eventParams.engagement_time_msec = engagementTimeMsec;
    }

    // ペイロードを構築（client_id優先、なければuser_id）
    const payload: {
      client_id?: string;
      user_id?: string;
      events: Array<{
        name: string;
        params: Record<string, unknown>;
      }>;
    } = {
      events: [
        {
          name: event.name,
          params: eventParams,
        },
      ],
    };

    if (validClientId) {
      payload.client_id = validClientId;
    } else if (userId) {
      payload.user_id = userId;
    }

    try {
      const response = await this.fetchWithRetry(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new GA4Error(
          `HTTP ${response.status}: ${response.statusText}`,
          GA4ErrorCode.API_ERROR,
          { status: response.status }
        );
      }

      logger.info("[GA4] Server event sent successfully", {
        tag: "ga4-server",
        event_name: event.name,
        client_id: validClientId,
        user_id: userId,
        session_id: sessionId,
      });

      if (this.config.debug) {
        logger.debug("[GA4] Server event payload", {
          tag: "ga4-server",
          event_name: event.name,
          payload: JSON.stringify(payload),
        });
      }
    } catch (error) {
      logger.error("[GA4] Failed to send server event", {
        tag: "ga4-server",
        event_name: event.name,
        client_id: validClientId,
        user_id: userId,
        error: error instanceof GA4Error ? error.message : String(error),
        error_code: error instanceof GA4Error ? error.code : undefined,
        error_context: error instanceof GA4Error ? error.context : undefined,
      });

      // エラーの詳細をデバッグログに出力
      if (this.config.debug) {
        logger.debug("[GA4] Server event error details", {
          tag: "ga4-server",
          error_stack: error instanceof Error ? error.stack : undefined,
          payload: JSON.stringify(payload),
        });
      }
    }
  }

  /**
   * 複数のイベントを一度に送信する（バッチ送信）
   *
   * イベントを25個ずつに自動分割し、並列処理で送信します。
   * 各イベントのパラメータは自動的に検証・サニタイズされます。
   * 一部のバッチが失敗しても、他のバッチの送信は継続されます。
   *
   * @param events - 送信するGA4イベントの配列
   * @param clientId - GA4 Client ID
   *
   * @example
   * ```typescript
   * const events = [
   *   { name: 'page_view', params: { page_title: 'Home' } },
   *   { name: 'scroll', params: { percent_scrolled: 90 } },
   *   // ... 最大数百イベント
   * ];
   *
   * // 自動的に25イベントずつに分割して並列送信
   * await ga4Server.sendEvents(events, clientId);
   * ```
   */
  async sendEvents(events: GA4Event[], clientId: string): Promise<void> {
    if (!this.config.enabled || !this.config.apiSecret) {
      logger.debug("[GA4] Server batch events skipped (disabled or no API secret)", {
        tag: "ga4-server",
        event_count: events.length,
        client_id: clientId,
      });
      return;
    }

    // Client ID検証（GA4Validator使用）
    const validation = GA4Validator.validateClientId(clientId);
    if (!validation.isValid) {
      logger.warn("[GA4] Invalid client ID for batch events", {
        tag: "ga4-server",
        client_id: clientId,
        errors: validation.errors,
        event_count: events.length,
      });
      return;
    }

    // 各イベントのパラメータを検証し、無効なイベントをフィルタリング
    const validatedEvents = events
      .map((event) => {
        const paramValidation = GA4Validator.validateAndSanitizeParams(
          event.params as Record<string, unknown>,
          this.config.debug
        );

        // sanitizedParamsが存在し、かつ元のパラメータが空でないのにサニタイズ後が空でない場合のみ有効
        if (
          paramValidation.sanitizedParams &&
          !(
            Object.keys(event.params).length > 0 &&
            Object.keys(paramValidation.sanitizedParams).length === 0
          )
        ) {
          return {
            name: event.name,
            params: paramValidation.sanitizedParams,
          };
        }

        // 無効なイベントをログに記録
        if (this.config.debug) {
          logger.debug("[GA4] Skipping invalid event in batch", {
            tag: "ga4-server",
            event_name: event.name,
            original_param_count: Object.keys(event.params).length,
            sanitized_param_count: paramValidation.sanitizedParams
              ? Object.keys(paramValidation.sanitizedParams).length
              : 0,
            errors: paramValidation.errors,
          });
        }

        return null;
      })
      .filter(
        (
          e
        ): e is {
          name: GA4Event["name"];
          params: Record<string, unknown>;
        } => e !== null
      );

    // 有効なイベントがない場合は送信しない
    if (validatedEvents.length === 0) {
      logger.warn("[GA4] No valid events in batch after validation", {
        tag: "ga4-server",
        original_count: events.length,
        client_id: clientId,
      });
      return;
    }

    // イベントを25個ずつに分割
    const batches: Array<{ name: string; params: Record<string, unknown> }[]> = [];
    for (let i = 0; i < validatedEvents.length; i += this.MAX_EVENTS_PER_BATCH) {
      batches.push(validatedEvents.slice(i, i + this.MAX_EVENTS_PER_BATCH));
    }

    logger.info("[GA4] Starting batch processing", {
      tag: "ga4-server",
      total_events: validatedEvents.length,
      total_batches: batches.length,
      max_events_per_batch: this.MAX_EVENTS_PER_BATCH,
      client_id: clientId,
    });

    // 並列処理でバッチを送信
    const results = await Promise.allSettled(
      batches.map((batch, index) => this.sendBatch(batch, clientId, index))
    );

    // 結果集計
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    logger.info("[GA4] Batch processing completed", {
      tag: "ga4-server",
      total_batches: batches.length,
      succeeded_batches: succeeded,
      failed_batches: failed,
      total_events: validatedEvents.length,
      client_id: clientId,
    });

    // 失敗したバッチの詳細をログに記録
    if (failed > 0 && this.config.debug) {
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          logger.debug("[GA4] Batch failed", {
            tag: "ga4-server",
            batch_index: index,
            error: result.reason,
          });
        }
      });
    }
  }

  /**
   * 単一バッチの送信（内部メソッド）
   *
   * リトライロジックを使用してバッチを送信します。
   * 送信に失敗した場合はエラーをスローし、Promise.allSettledで捕捉されます。
   *
   * @param batch - 送信するイベントの配列（検証済み）
   * @param clientId - GA4 Client ID
   * @param batchIndex - バッチのインデックス（ログ用）
   * @throws GA4Error 送信に失敗した場合
   */
  private async sendBatch(
    batch: Array<{ name: string; params: Record<string, unknown> }>,
    clientId: string,
    batchIndex: number
  ): Promise<void> {
    const url = `${this.MEASUREMENT_PROTOCOL_URL}?measurement_id=${this.config.measurementId}&api_secret=${this.config.apiSecret}`;

    const payload = {
      client_id: clientId,
      events: batch,
    };

    if (this.config.debug) {
      logger.debug("[GA4] Sending batch", {
        tag: "ga4-server",
        batch_index: batchIndex,
        batch_size: batch.length,
        event_names: batch.map((e) => e.name).join(", "),
      });
    }

    try {
      const response = await this.fetchWithRetry(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new GA4Error(
          `Batch ${batchIndex} failed: HTTP ${response.status}`,
          GA4ErrorCode.API_ERROR,
          { batch_index: batchIndex, status: response.status, batch_size: batch.length }
        );
      }

      logger.info("[GA4] Batch sent successfully", {
        tag: "ga4-server",
        batch_index: batchIndex,
        batch_size: batch.length,
        event_names: batch.map((e) => e.name).join(", "),
      });

      if (this.config.debug) {
        logger.debug("[GA4] Batch payload", {
          tag: "ga4-server",
          batch_index: batchIndex,
          payload: JSON.stringify(payload),
        });
      }
    } catch (error) {
      logger.error("[GA4] Failed to send batch", {
        tag: "ga4-server",
        batch_index: batchIndex,
        batch_size: batch.length,
        error: error instanceof GA4Error ? error.message : String(error),
        error_code: error instanceof GA4Error ? error.code : undefined,
        error_context: error instanceof GA4Error ? error.context : undefined,
      });

      // エラーを再スローして、Promise.allSettledで捕捉できるようにする
      throw error;
    }
  }

  /**
   * リトライロジック付きfetch（内部メソッド）
   *
   * 指数バックオフとランダムジッターを使用して、一時的なエラーに対してリトライを実行します。
   * - 5xxエラー: リトライ対象
   * - 4xxエラー: リトライせず即座に返す
   * - バックオフ: 2^attempt × 1000ms（最大10秒）
   * - ジッター: 0〜1000msのランダム遅延
   *
   * @param url - リクエストURL
   * @param options - fetchオプション
   * @param maxRetries - 最大リトライ回数（デフォルト: 3）
   * @returns Response オブジェクト
   * @throws GA4Error リトライが全て失敗した場合
   *
   * @example
   * ```typescript
   * // 内部で自動的に使用されます
   * const response = await this.fetchWithRetry(url, options);
   * ```
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    maxRetries: number = this.MAX_RETRIES
  ): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await this.fetcher(url, options);

        // 5xxエラーの場合はリトライ対象
        if (response.status >= 500 && response.status < 600) {
          throw new GA4Error(
            `HTTP ${response.status}: ${response.statusText}`,
            GA4ErrorCode.API_ERROR,
            { status: response.status, attempt: attempt + 1 }
          );
        }

        // 成功またはリトライ不要なエラー（4xx）の場合は即座に返す
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // 最後の試行以外は待機してリトライ
        if (attempt < maxRetries - 1) {
          // 指数バックオフ: 2^attempt * 1000ms、最大MAX_RETRY_DELAYまで
          const baseDelay = Math.min(1000 * Math.pow(2, attempt), this.MAX_RETRY_DELAY);
          // ランダムジッター: 0〜MAX_JITTERミリ秒
          const jitter = Math.random() * this.MAX_JITTER;
          const delay = baseDelay + jitter;

          if (this.config.debug) {
            logger.debug("[GA4] Retrying after error", {
              tag: "ga4-server",
              attempt: attempt + 1,
              max_retries: maxRetries,
              delay_ms: Math.round(delay),
              error: lastError.message,
            });
          }

          // 待機
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // 全てのリトライが失敗
    throw new GA4Error("Retry exhausted", GA4ErrorCode.RETRY_EXHAUSTED, {
      lastError: lastError?.message,
      attempts: maxRetries,
    });
  }

  /**
   * Client IDフォーマット検証（XXXXXXXXXX.YYYYYYYYYY）
   *
   * @param clientId - 検証するClient ID
   * @returns boolean 有効なフォーマットの場合はtrue
   */
  private isValidClientId(clientId: string): boolean {
    // GA4 Client IDの形式: 数字.数字（例: 1234567890.1234567890）
    const clientIdPattern = /^\d+\.\d+$/;
    return clientIdPattern.test(clientId);
  }

  /**
   * GA4が有効かどうかを確認する
   *
   * 環境変数 `NEXT_PUBLIC_GA4_ENABLED` の値を動的に取得します。
   *
   * @returns boolean GA4が有効な場合はtrue
   *
   * @example
   * ```typescript
   * if (ga4Server.isEnabled()) {
   *   await ga4Server.sendEvent(event, clientId);
   * }
   * ```
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Measurement Protocol APIが利用可能かどうかを確認する
   *
   * GA4が有効で、かつAPI Secretが設定されている場合にtrueを返します。
   * 環境変数 `GA4_API_SECRET` の値を動的に取得します。
   *
   * @returns boolean API Secretが設定されている場合はtrue
   *
   * @example
   * ```typescript
   * if (ga4Server.isMeasurementProtocolAvailable()) {
   *   // サーバー側イベント送信が可能
   * }
   * ```
   */
  isMeasurementProtocolAvailable(): boolean {
    return this.config.enabled && !!this.config.apiSecret;
  }

  /**
   * デバッグモードかどうかを確認する
   *
   * 環境変数 `NEXT_PUBLIC_GA4_DEBUG` の値を動的に取得します。
   * デバッグモードが有効な場合、詳細なログが出力されます。
   *
   * @returns boolean デバッグモードの場合はtrue
   *
   * @example
   * ```typescript
   * if (ga4Server.isDebugMode()) {
   *   console.log('GA4 debug mode is enabled');
   * }
   * ```
   */
  isDebugMode(): boolean {
    return this.config.debug;
  }
}

// シングルトンインスタンス（デフォルトのfetchを使用）
export const ga4Server = new GA4ServerService();
```

#### core/analytics/ga4-validator.ts
```
/**
 * GA4 Analytics Validation Utilities
 *
 * Provides validation and sanitization for GA4 client IDs and event parameters
 * according to Google Analytics 4 specifications.
 */

/**
 * Result of a validation operation
 */
export interface ValidationResult {
  /** Whether the validation passed */
  isValid: boolean;
  /** List of validation error messages */
  errors: string[];
  /** Sanitized parameters (only present for parameter validation) */
  sanitizedParams?: Record<string, unknown>;
}

/**
 * Validator for GA4 client IDs and event parameters
 */
export class GA4Validator {
  /** Pattern for valid GA4 client IDs: exactly 10 digits, a period, and exactly 10 digits */
  private static readonly CLIENT_ID_PATTERN = /^\d{10}\.\d{10}$/;

  /** Pattern for valid parameter names: alphanumeric and underscores, 1-40 characters */
  private static readonly PARAM_NAME_PATTERN = /^[a-zA-Z0-9_]{1,40}$/;

  /** Maximum length for string parameter values */
  private static readonly MAX_STRING_LENGTH = 100;

  /** Invalid client ID prefixes that should be rejected */
  private static readonly INVALID_CLIENT_ID_PREFIXES = ["GA1.", "1.."];

  /**
   * Validates a GA4 client ID
   *
   * @param clientId - The client ID to validate
   * @returns Validation result with any errors found
   *
   * @example
   * ```typescript
   * const result = GA4Validator.validateClientId("1234567890.0987654321");
   * if (!result.isValid) {
   *   console.error("Invalid client ID:", result.errors);
   * }
   * ```
   */
  static validateClientId(clientId: string): ValidationResult {
    const errors: string[] = [];

    if (!clientId) {
      errors.push("Client ID is empty");
      return { isValid: false, errors };
    }

    // Check for invalid prefixes
    for (const prefix of this.INVALID_CLIENT_ID_PREFIXES) {
      if (clientId.startsWith(prefix)) {
        errors.push(`Client ID contains invalid prefix: ${prefix}`);
      }
    }

    // Validate pattern: 10 digits, period, 10 digits
    if (!this.CLIENT_ID_PATTERN.test(clientId)) {
      errors.push("Client ID does not match required format (10digits.10digits)");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validates and sanitizes event parameters according to GA4 specifications
   *
   *- Parameter names must be alphanumeric with underscores, max 40 characters
   * - String values are truncated to 100 characters
   * - Invalid parameters are excluded from the result
   *
   * @param params - The event parameters to validate and sanitize
   * @param debug - Whether to log debug information
   * @returns Validation result with sanitized parameters
   *
   * @example
   * ```typescript
   * const result = GA4Validator.validateAndSanitizeParams({
   *   event_name: "purchase",
   *   "invalid-name": "value", // Will be excluded
   *   long_string: "a".repeat(150) // Will be truncated to 100 chars
   * });
   * ```
   */
  static validateAndSanitizeParams(
    params: Record<string, unknown>,
    debug: boolean = false
  ): ValidationResult {
    const errors: string[] = [];
    const sanitizedParams: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(params)) {
      // Validate parameter name
      if (!this.PARAM_NAME_PATTERN.test(key)) {
        errors.push(`Invalid parameter name: ${key}`);
        if (debug) {
          console.log(`[GA4] Skipping invalid parameter name: ${key}`);
        }
        continue;
      }

      // Sanitize string values by truncating if necessary
      if (typeof value === "string") {
        if (value.length > this.MAX_STRING_LENGTH) {
          sanitizedParams[key] = value.substring(0, this.MAX_STRING_LENGTH);
          if (debug) {
            console.log(
              `[GA4] Truncated parameter ${key} from ${value.length} to ${this.MAX_STRING_LENGTH} characters`
            );
          }
        } else {
          sanitizedParams[key] = value;
        }
      } else {
        // Non-string values pass through unchanged
        sanitizedParams[key] = value;
      }
    }

    // 空のパラメータも有効とする（GA4はパラメータなしのイベントを許可）
    return {
      isValid: true,
      errors,
      sanitizedParams,
    };
  }
}
```

#### core/analytics/index.ts
```
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
```
