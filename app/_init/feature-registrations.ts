/**
 * Feature Registrations
 * 全てのfeature層のアダプタを登録する初期化コード
 */

import "server-only";

import { isPaymentPortRegistered } from "@core/ports/payments";
import { isSettlementReportPortRegistered } from "@core/ports/settlements";
import { isStripeConnectPortRegistered } from "@core/ports/stripe-connect";

import { registerPaymentAdapters } from "@features/payments/server";
import { registerSettlementsAdapters } from "@features/settlements/server";
import { registerStripeConnectAdapters } from "@features/stripe-connect/server";

/**
 * 全てのfeature層アダプタを登録
 * サーバーサイドの初期化時に一度だけ呼び出される
 * Idempotent: 複数回呼ばれても安全（2回目以降はスキップ）
 */
export function registerAllFeatures(): void {
  // Payment機能の実装を登録
  if (!isPaymentPortRegistered()) {
    registerPaymentAdapters();
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

/**
 * server entrypoint で呼び出す単一入口
 * 明示的・冪等に feature 登録を保証する
 */
export function ensureFeaturesRegistered(): void {
  registerAllFeatures();
}
