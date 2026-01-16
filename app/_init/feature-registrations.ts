/**
 * Feature Registrations
 * 全てのfeature層のアダプタを登録する初期化コード
 */

import { registerSettlementsAdapters } from "@features/settlements/server";
import { registerStripeConnectAdapters } from "@features/stripe-connect/server";

/**
 * 全てのfeature層アダプタを登録
 * サーバーサイドの初期化時に一度だけ呼び出される
 */
export function registerAllFeatures(): void {
  // Settlement機能のアダプタを登録
  registerSettlementsAdapters();

  // Stripe Connect機能のアダプタを登録
  registerStripeConnectAdapters();
}

// サーバーサイドでの自動初期化（副作用import対応）
if (typeof window === "undefined") {
  registerAllFeatures();
}
