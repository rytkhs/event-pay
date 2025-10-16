/**
 * Event Handlers Setup
 * Core層のイベント処理基盤
 * 具体的なハンドラ登録はfeature層で行う（Ports & Adapters Pattern）
 */

import { logger } from "@core/logging/app-logger";

import { getEventRegistry } from "./payment-events";

/**
 * イベントレジストリの初期化
 * 実際のハンドラ登録は各feature層のアダプタで実行
 */
export function initializeEventSystem(): void {
  // イベントレジストリの初期化のみ実行
  // 具体的なハンドラはfeature層で登録される
  getEventRegistry();
}

/**
 * 後方互換性のための関数
 * @deprecated イベントハンドラ登録はfeature層のアダプタで実行されます
 */
export async function setupEventHandlers(): Promise<void> {
  // 空実装 - 実際のハンドラ登録は各feature層で行われる
  logger.info("Event registry initialized. Handlers will be registered by feature adapters.", {
    tag: "event-setup",
  });
}

// サーバーサイドでの初期化
if (typeof window === "undefined") {
  initializeEventSystem();
}
