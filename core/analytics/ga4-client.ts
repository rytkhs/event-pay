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

/**
 * GA4クライアント側サービスクラス
 */
export class GA4ClientService {
  private config = getGA4Config();

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
   * @returns Promise<string | null> Client ID、取得できない場合はnull
   */
  async getClientId(): Promise<string | null> {
    if (!this.config.enabled) {
      if (this.config.debug) {
        console.log("[GA4] Client ID request skipped (disabled)");
      }
      return null;
    }

    return new Promise((resolve) => {
      if (typeof window === "undefined" || !window.gtag) {
        if (this.config.debug) {
          console.log("[GA4] gtag not available, returning null");
        }
        resolve(null);
        return;
      }

      try {
        window.gtag("get", this.config.measurementId, "client_id", (clientId: string) => {
          if (this.config.debug) {
            console.log("[GA4] Client ID retrieved:", clientId);
          }
          resolve(clientId);
        });
      } catch (error) {
        console.error("[GA4] Failed to get client ID:", error);
        resolve(null);
      }
    });
  }

  /**
   * イベント送信後にコールバックを実行する
   *
   * @param event - 送信するGA4イベント
   * @param callback - イベント送信後に実行するコールバック関数
   */
  sendEventWithCallback(event: GA4Event, callback: () => void): void {
    if (!this.config.enabled) {
      if (this.config.debug) {
        console.log("[GA4] Event with callback skipped (disabled):", event);
      }
      // GA4が無効でも、コールバックは実行する
      callback();
      return;
    }

    try {
      // event_callbackパラメータを追加してイベントを送信
      const eventWithCallback = {
        ...event,
        params: {
          ...event.params,
          event_callback: callback,
        },
      };

      sendGAEvent(eventWithCallback.name, eventWithCallback.params);

      if (this.config.debug) {
        console.log("[GA4] Event with callback sent:", event);
      }
    } catch (error) {
      console.error("[GA4] Failed to send event with callback:", error);
      // エラーが発生してもコールバックは実行する
      callback();
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
