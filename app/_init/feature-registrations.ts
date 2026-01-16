/**
 * Feature Registrations
 * 全てのfeature層のアダプタを登録する初期化コード
 */

import { isSettlementReportPortRegistered } from "@core/ports/settlements";
import { isStripeConnectPortRegistered } from "@core/ports/stripe-connect";
import paymentRegistry from "@core/services/payment-registry";

import { registerPaymentImplementations } from "@features/payments/core-bindings";
import { registerSettlementsAdapters } from "@features/settlements/server";
import { registerStripeConnectAdapters } from "@features/stripe-connect/server";

/**
 * 全てのfeature層アダプタを登録
 * サーバーサイドの初期化時に一度だけ呼び出される
 * Idempotent: 複数回呼ばれても安全（2回目以降はスキップ）
 */
export function registerAllFeatures(): void {
  // Payment機能の実装を登録
  if (!paymentRegistry.isRegistered()) {
    registerPaymentImplementations();
  }

  // Settlement機能のアダプタを登録
  if (!isSettlementReportPortRegistered()) {
    registerSettlementsAdapters();
  }

  // Stripe Connect機能のアダプタを登録
  if (!isStripeConnectPortRegistered()) {
    registerStripeConnectAdapters();
  }
}

// サーバーサイドでの自動初期化（副作用import対応）
if (typeof window === "undefined") {
  registerAllFeatures();
}
