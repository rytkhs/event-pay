/**
 * GA4 Client-Side Analytics Service
 *
 * クライアント側でのGA4イベント送信を管理するサービス
 * @next/third-partiesのsendGAEventをラップし、型安全なイベント送信を提供
 */

"use client";

import { sendGAEvent } from "@next/third-parties/google";

import { logger } from "@core/logging/app-logger";

import { getGA4Config } from "./config";
import type { GA4Event } from "./event-types";
import { GA4Validator } from "./ga4-validator";

/**
 * GA4クライアント側サービスクラス
 */
export class GA4ClientService {
  private readonly config: ReturnType<typeof getGA4Config>;

  constructor() {
    this.config = getGA4Config();
  }

  /**
   * 構造化ログ用のロガー
   */
  private get logger() {
    return logger.withContext({
      category: "system",
      action: "ga4_client_side",
      actor_type: "user",
    });
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
        this.logger.debug("[GA4] Event skipped (disabled)", {
          event_name: event.name,
          params: event.params,
          outcome: "success",
        });
      }
      return;
    }

    try {
      sendGAEvent(event.name, event.params);

      if (this.config.debug) {
        this.logger.debug("[GA4] Event sent", {
          event_name: event.name,
          params: event.params,
          outcome: "success",
        });
      }
    } catch (error) {
      this.logger.error("[GA4] Failed to send event", {
        event_name: event.name,
        error_message: error instanceof Error ? error.message : String(error),
        outcome: "failure",
      });
    }
  }

  /**
   * GA4 Client IDを取得する（Stripe決済用）
   *
   * タイムアウト処理とClient ID検証を含みます。
   * Client IDは `数字10桁.数字10桁` の形式で検証されます。
   * タイムアウトまたは検証失敗時はnullを返します。
   * window.gtagが利用可能になるまで待機します。
   *
   * @param timeoutMs - タイムアウト時間（ミリ秒）、デフォルトは200ms
   * @returns Promise<string | null> Client ID、取得できない場合はnull
   *
   * @example
   * ```typescript
   * // デフォルトタイムアウト（1000ms）
   * const clientId = await ga4Client.getClientId();
   * if (clientId) {
   *   console.log('Client ID:', clientId);
   * }
   *
   * // カスタムタイムアウト
   * const clientId = await ga4Client.getClientId(1000);
   * ```
   */
  async getClientId(timeoutMs: number = 1000): Promise<string | null> {
    if (!this.config.enabled) {
      if (this.config.debug) {
        this.logger.debug("[GA4] Client ID request skipped (disabled)", {
          outcome: "success",
        });
      }
      return null;
    }

    return new Promise((resolve) => {
      let resolved = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let intervalId: ReturnType<typeof setInterval> | null = null;

      // 二重解決を防ぐsafeResolveパターン
      const safeResolve = (value: string | null) => {
        if (!resolved) {
          resolved = true;
          if (timeoutId) clearTimeout(timeoutId);
          if (intervalId) clearInterval(intervalId);
          resolve(value);
        }
      };

      // タイムアウト設定
      timeoutId = setTimeout(() => {
        if (this.config.debug) {
          this.logger.debug("[GA4] Client ID retrieval timed out", {
            outcome: "failure",
          });
        }
        safeResolve(null);
      }, timeoutMs);

      const checkGtag = () => {
        if (typeof window !== "undefined" && window.gtag) {
          try {
            window.gtag("get", this.config.measurementId, "client_id", (clientId: string) => {
              // プレフィックス（GA1.1.など）を除去してサニタイズ
              const sanitizedClientId = GA4Validator.sanitizeClientId(clientId);

              // Client ID検証
              const validation = GA4Validator.validateClientId(sanitizedClientId);
              if (!validation.isValid) {
                if (this.config.debug) {
                  this.logger.debug("[GA4] Invalid client ID received", {
                    original_client_id: clientId,
                    sanitized_client_id: sanitizedClientId,
                    errors: validation.errors,
                    outcome: "failure",
                  });
                }
                safeResolve(null);
                return;
              }

              if (this.config.debug) {
                this.logger.debug("[GA4] Client ID retrieved", {
                  original_client_id: clientId,
                  sanitized_client_id: sanitizedClientId,
                  outcome: "success",
                });
              }
              safeResolve(sanitizedClientId);
            });
          } catch (error) {
            this.logger.error("[GA4] Failed to get client ID", {
              error_message: error instanceof Error ? error.message : String(error),
              outcome: "failure",
            });
            safeResolve(null);
          }
          return true;
        }
        return false;
      };

      // 即時チェック
      if (!checkGtag()) {
        // 利用できない場合はポーリング開始 (100ms間隔)
        intervalId = setInterval(() => {
          if (checkGtag()) {
            if (intervalId) clearInterval(intervalId);
          }
        }, 100);
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
        this.logger.debug("[GA4] Event with callback skipped (disabled)", {
          event_name: event.name,
          outcome: "success",
        });
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
    const timeoutId: ReturnType<typeof setTimeout> = setTimeout(() => {
      if (this.config.debug) {
        this.logger.debug("[GA4] Event callback timed out", {
          event_name: event.name,
          outcome: "failure",
        });
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
        this.logger.debug("[GA4] Event with callback sent", {
          event_name: event.name,
          outcome: "success",
        });
      }
    } catch (error) {
      clearTimeout(timeoutId);
      this.logger.error("[GA4] Failed to send event with callback", {
        event_name: event.name,
        error_message: error instanceof Error ? error.message : String(error),
        outcome: "failure",
      });
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
   * `NODE_ENV === "development"` の場合にtrueを返します。
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
