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
   * @param event - 送信するGA4イベント
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
   * タイムアウト処理とClient ID検証を含む
   *
   * @param timeoutMs - タイムアウト時間（ミリ秒）、デフォルトは3000ms
   * @returns Promise<string | null> Client ID、取得できない場合はnull
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
   * タイムアウト処理とコールバック二重実行防止を含む
   *
   * @param event - 送信するGA4イベント
   * @param callback - イベント送信後に実行するコールバック関数
   * @param timeoutMs - タイムアウト時間（ミリ秒）、デフォルトは2000ms
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
        console.log("[GA4] Event callback timeout reached:", event.name);
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
   * @returns boolean GA4が有効な場合はtrue
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * デバッグモードかどうかを確認する
   *
   * @returns boolean デバッグモードの場合はtrue
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
