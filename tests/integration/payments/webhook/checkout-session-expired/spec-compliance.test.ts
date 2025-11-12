/**
 * checkout.session.expired Webhook 仕様書準拠性検証テスト
 */

import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";

import type { Database } from "../../../../../types/database";
import { createWebhookTestSetup, type WebhookTestSetup } from "../../../../setup/common-test-setup";

describe("📋 仕様書準拠性検証", () => {
  let setup: WebhookTestSetup;

  beforeAll(async () => {
    // 共通Webhookテストセットアップを使用（QStash環境変数も設定される）
    setup = await createWebhookTestSetup({
      testName: `checkout-expired-spec-test-${Date.now()}`,
      eventFee: 1500,
      accessedTables: ["public.payments", "public.attendances"],
    });
  });

  afterAll(async () => {
    try {
      // テスト実行（必要に応じて）
    } finally {
      // 必ずクリーンアップを実行
      await setup.cleanup();
    }
  });

  test("ステータスランク値の実装準拠", async () => {
    // 仕様書記載のステータスランクを検証
    const { statusRank } = await import("../../../../../core/utils/payments/status-rank");

    const expectedRanks = {
      pending: 10,
      failed: 15,
      paid: 20,
      received: 20,
      waived: 25,
      canceled: 35,
      refunded: 40,
    };

    Object.entries(expectedRanks).forEach(([status, rank]) => {
      expect(statusRank(status as any)).toBe(rank);
    });
  });

  test("実装ファイルパスの確認", async () => {
    const mod1 = await import(
      "../../../../../features/payments/services/webhook/webhook-event-handler"
    );
    expect(mod1.StripeWebhookEventHandler).toBeDefined();
    const mod2 = await import("../../../../../core/utils/payments/status-rank");
    expect(mod2.canPromoteStatus).toBeDefined();
    const mod3 = await import("../../../../../core/logging/app-logger");
    expect((mod3 as any).logger).toBeDefined();
  });

  test("データベーススキーマ型定義の準拠", () => {
    // 型定義が期待通りに存在することを確認
    type PaymentStatus = Database["public"]["Enums"]["payment_status_enum"];
    type _PaymentTable = Database["public"]["Tables"]["payments"];

    // この型が正しくインポートできることで間接的に確認
    const mockPaymentStatus: PaymentStatus = "failed";
    expect(mockPaymentStatus).toBe("failed");
  });
});
