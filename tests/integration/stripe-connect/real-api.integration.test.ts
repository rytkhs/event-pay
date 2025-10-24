/**
 * Stripe Connect Real API Integration Tests
 * 実際のStripe Test Modeを使用した統合テスト
 * 既存環境変数を活用、追加設定不要
 */
import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";

import { logger } from "@core/logging/app-logger";
import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";

import { StripeConnectService } from "@features/stripe-connect/services/service";

import { createTestUser } from "@/tests/helpers/test-user";

describe("Stripe Connect Real API Integration", () => {
  let service: StripeConnectService;
  let testUserId: string;
  let createdStripeAccountIds: string[] = [];

  beforeEach(async () => {
    // 実Supabaseクライアントを使用（モックなし）
    const factory = SecureSupabaseClientFactory.create();
    const adminClient = await factory.createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "Stripe Connect Real API Integration Test",
      {
        operationType: "SELECT",
        accessedTables: ["public.users"],
        additionalInfo: { testType: "stripe-connect-integration" },
      }
    );

    service = new StripeConnectService(adminClient);

    // テストユーザー作成
    const testUser = await createTestUser(
      `stripe-connect-test-${Date.now()}@example.com`,
      "TestPassword123!"
    );
    testUserId = testUser.id;

    logger.info("Integration test setup completed", {
      testUserId,
      useRealAPI: true,
    });
  });

  afterEach(async () => {
    // 作成されたStripe Accountsをクリーンアップ（Test Modeなので安全）
    for (const accountId of createdStripeAccountIds) {
      try {
        logger.info("Cleaning up test Stripe account", { accountId });
        // Note: Stripe Test Modeではアカウント削除不可のため、
        // データベースレコードのみクリーンアップ
      } catch (error) {
        logger.warn("Failed to cleanup Stripe account", { accountId, error });
      }
    }
    createdStripeAccountIds = [];
  });

  describe("Express Account Creation (Real API)", () => {
    it("should create actual Express Account via Stripe API", async () => {
      // 実際のStripe API呼び出し（モックなし）
      const result = await service.createExpressAccount({
        userId: testUserId,
        email: `test-${Date.now()}@example.com`,
        country: "JP",
        businessType: "individual",
      });

      // 実際のStripe Account IDが返されることを検証
      expect(result.accountId).toMatch(/^acct_[a-zA-Z0-9]+$/);
      expect(result.accountId).not.toBe("acct_test"); // モックでないことを確認

      // クリーンアップ用に記録
      createdStripeAccountIds.push(result.accountId);

      // DBレコードとの整合性検証
      const dbAccount = await service.getConnectAccountByUser(testUserId);
      expect(dbAccount).toBeDefined();
      expect(dbAccount!.stripe_account_id).toBe(result.accountId);
      expect(dbAccount!.status).toBe("unverified");
      expect(dbAccount!.charges_enabled).toBe(false);
      expect(dbAccount!.payouts_enabled).toBe(false);

      logger.info("Real API integration test passed", {
        accountId: result.accountId,
        testUserId,
      });
    }, 30000); // 30秒タイムアウト（実API呼び出しのため）

    it("should handle duplicate creation with idempotency", async () => {
      // Issue #124 修正後: べき等性を確保し、同じアカウント情報を返す

      // 1回目の作成
      const result1 = await service.createExpressAccount({
        userId: testUserId,
        email: `test-${Date.now()}@example.com`,
        country: "JP",
        businessType: "individual",
      });

      createdStripeAccountIds.push(result1.accountId);

      // 2回目の作成（同じuserIdで） - べき等性により同じ結果を返す
      const result2 = await service.createExpressAccount({
        userId: testUserId,
        email: `test-${Date.now()}@example.com`, // 異なるメールでも既存アカウントを返す
        country: "JP",
        businessType: "individual",
      });

      // べき等性の確認: 同じアカウントIDが返されることを検証
      expect(result2.accountId).toBe(result1.accountId);
      expect(result2.status).toBe(result1.status);

      logger.info("Idempotency test passed", {
        accountId: result1.accountId,
        testUserId,
        result1,
        result2,
      });
    }, 30000);

    it("should create Account Link with real Stripe API", async () => {
      // まずExpress Accountを作成
      const accountResult = await service.createExpressAccount({
        userId: testUserId,
        email: `test-${Date.now()}@example.com`,
        country: "JP",
        businessType: "individual",
      });

      createdStripeAccountIds.push(accountResult.accountId);

      // Account Linkを生成
      const linkResult = await service.createAccountLink({
        accountId: accountResult.accountId,
        refreshUrl: "https://example.com/refresh",
        returnUrl: "https://example.com/return",
        type: "account_onboarding",
      });

      // 実際のStripe Account Link URLが返されることを検証
      // NOTE: Issue #125 - 実APIでは /setup/e/ パターンが使用される
      expect(linkResult.url).toMatch(/^https:\/\/connect\.stripe\.com\/setup\/[es]\/.+$/);
      expect(linkResult.expiresAt).toBeGreaterThan(Date.now() / 1000);
      expect(typeof linkResult.url).toBe("string");
      expect(linkResult.url).not.toContain("/setup/s/abc"); // モックでないことを確認
    }, 30000);
  });

  describe("Error Handling (Real API)", () => {
    it("should handle invalid email format", async () => {
      await expect(
        service.createExpressAccount({
          userId: testUserId,
          email: "invalid-email", // 無効なメールフォーマット
          country: "JP",
          businessType: "individual",
        })
      ).rejects.toThrow(); // Stripeが実際のValidationErrorを返すことを確認
    }, 15000);

    it("should handle invalid country code", async () => {
      await expect(
        service.createExpressAccount({
          userId: testUserId,
          email: `test-${Date.now()}@example.com`,
          country: "INVALID", // 無効な国コード
          businessType: "individual",
        })
      ).rejects.toThrow(); // Stripeが実際のエラーを返すことを確認
    }, 15000);
  });
});
