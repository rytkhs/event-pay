/**
 * Payment Analytics Service
 *
 * 決済関連のGA4イベント追跡を管理するサービス
 * Stripe webhook経由での購入完了イベントの送信を担当
 */

import "server-only";

import type { PurchaseParams } from "@core/analytics/event-types";
import { ga4Server } from "@core/analytics/ga4-server";
import { logger } from "@core/logging/app-logger";
import { handleServerError } from "@core/utils/error-handler";

/**
 * 購入完了追跡のパラメータ
 */
export interface TrackPurchaseCompletionParams {
  /** GA4 Client ID */
  clientId: string;
  /** Stripeトランザクション ID (Checkout Session ID) */
  transactionId: string;
  /** イベントID */
  eventId: string;
  /** イベントタイトル */
  eventTitle: string;
  /** 金額（円） */
  amount: number;
}

/**
 * 決済アナリティクスサービスクラス
 */
export class PaymentAnalyticsService {
  /**
   * 購入完了イベントを送信する（webhook経由）
   *
   * Stripe webhookの`checkout.session.completed`イベント受信時に呼び出され、
   * GA4 Measurement Protocol APIを使用してサーバー側から購入イベントを送信する
   *
   * @param params - 購入完了追跡のパラメータ
   */
  async trackPurchaseCompletion(params: TrackPurchaseCompletionParams): Promise<void> {
    const { clientId, transactionId, eventId, eventTitle, amount } = params;

    // パラメータのバリデーション
    if (!clientId || !transactionId || !eventId || !eventTitle) {
      logger.warn("[Payment Analytics] Missing required parameters", {
        category: "payment",
        action: "payment_analytics",
        actor_type: "system",
        has_client_id: !!clientId,
        has_transaction_id: !!transactionId,
        has_event_id: !!eventId,
        has_event_title: !!eventTitle,
        outcome: "failure",
      });
      return;
    }

    if (amount <= 0) {
      logger.warn("[Payment Analytics] Invalid amount", {
        category: "payment",
        action: "payment_analytics",
        actor_type: "system",
        amount,
        transaction_id: transactionId,
        outcome: "failure",
      });
      return;
    }

    // GA4購入イベントのパラメータを構築
    const purchaseParams: PurchaseParams = {
      transaction_id: transactionId,
      event_id: eventId,
      currency: "JPY",
      value: amount,
      items: [
        {
          item_id: eventId,
          item_name: eventTitle,
          price: amount,
          quantity: 1,
        },
      ],
    };

    try {
      // GA4サーバーサービスを使用してイベントを送信
      await ga4Server.sendEvent({ name: "purchase", params: purchaseParams }, clientId);

      logger.info("[Payment Analytics] Purchase event tracked successfully", {
        category: "payment",
        action: "payment_analytics",
        actor_type: "system",
        transaction_id: transactionId,
        event_id: eventId,
        amount,
        outcome: "success",
      });
    } catch (error) {
      handleServerError("GA4_TRACKING_FAILED", {
        category: "payment",
        action: "track_purchase_completion",
        additionalData: {
          transaction_id: transactionId,
          event_id: eventId,
          amount,
        },
      });

      // エラーが発生してもwebhook処理は継続させる
      // GA4イベント送信の失敗は決済処理に影響を与えない
    }
  }

  /**
   * GA4 Measurement Protocolが利用可能かどうかを確認する
   *
   * @returns boolean API Secretが設定されている場合はtrue
   */
  isAvailable(): boolean {
    return ga4Server.isMeasurementProtocolAvailable();
  }
}

// シングルトンインスタンス
export const paymentAnalytics = new PaymentAnalyticsService();
