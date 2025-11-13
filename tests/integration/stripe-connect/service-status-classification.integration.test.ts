/**
 * StripeConnectService Status Classification Integration Tests
 * getAccountInfoメソッドのステータス分類統合テスト
 */
import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import type Stripe from "stripe";

import { logger } from "@core/logging/app-logger";

import {
  setupStripeConnectRealApiTest,
  type StripeConnectRealApiTestSetup,
} from "./stripe-connect-real-api-test-setup";

describe("StripeConnectService Status Classification Integration", () => {
  let setup: StripeConnectRealApiTestSetup;

  beforeAll(async () => {
    setup = await setupStripeConnectRealApiTest();
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  describe("getAccountInfo with AccountStatusClassifier", () => {
    it("should classify newly created account as unverified", async () => {
      // 新しいExpress Accountを作成
      const createResult = await setup.service.createExpressAccount({
        userId: setup.testUser.id,
        email: `test-${Date.now()}@example.com`,
        country: "JP",
        businessType: "individual",
      });

      setup.createdStripeAccountIds.push(createResult.accountId);

      // getAccountInfoでアカウント情報を取得
      const accountInfo = await setup.service.getAccountInfo(createResult.accountId);

      // 新規作成アカウントはunverifiedに分類されることを検証
      expect(accountInfo.status).toBe("unverified");
      expect(accountInfo.accountId).toBe(createResult.accountId);
      expect(accountInfo.chargesEnabled).toBe(false);
      expect(accountInfo.payoutsEnabled).toBe(false);

      logger.info("Unverified account classification test passed", {
        accountId: createResult.accountId,
        status: accountInfo.status,
      });
    }, 30000);

    it("should return formatted requirements and capabilities", async () => {
      // 新しいExpress Accountを作成
      const createResult = await setup.service.createExpressAccount({
        userId: setup.testUser.id,
        email: `test-${Date.now()}@example.com`,
        country: "JP",
        businessType: "individual",
      });

      setup.createdStripeAccountIds.push(createResult.accountId);

      // getAccountInfoでアカウント情報を取得
      const accountInfo = await setup.service.getAccountInfo(createResult.accountId);

      // requirementsが整形されていることを検証
      expect(accountInfo.requirements).toBeDefined();
      expect(accountInfo.requirements).toHaveProperty("currently_due");
      expect(accountInfo.requirements).toHaveProperty("eventually_due");
      expect(accountInfo.requirements).toHaveProperty("past_due");
      expect(accountInfo.requirements).toHaveProperty("pending_verification");
      expect(Array.isArray(accountInfo.requirements?.currently_due)).toBe(true);

      // capabilitiesが整形されていることを検証
      expect(accountInfo.capabilities).toBeDefined();
      expect(accountInfo.capabilities).toHaveProperty("card_payments");
      expect(accountInfo.capabilities).toHaveProperty("transfers");

      logger.info("Requirements and capabilities formatting test passed", {
        accountId: createResult.accountId,
        requirements: accountInfo.requirements,
        capabilities: accountInfo.capabilities,
      });
    }, 30000);

    it("should handle account with details_submitted", async () => {
      // 新しいExpress Accountを作成
      const createResult = await setup.service.createExpressAccount({
        userId: setup.testUser.id,
        email: `test-${Date.now()}@example.com`,
        country: "JP",
        businessType: "individual",
      });

      setup.createdStripeAccountIds.push(createResult.accountId);

      // getAccountInfoでアカウント情報を取得
      const accountInfo = await setup.service.getAccountInfo(createResult.accountId);

      // details_submittedがfalseの場合はunverifiedに分類
      expect(accountInfo.status).toBe("unverified");

      logger.info("Details submitted handling test passed", {
        accountId: createResult.accountId,
        status: accountInfo.status,
      });
    }, 30000);
  });

  describe("Error Handling", () => {
    it("should throw error for invalid account ID", async () => {
      await expect(setup.service.getAccountInfo("invalid_account_id")).rejects.toThrow();
    }, 15000);

    it("should throw error for non-existent account", async () => {
      await expect(setup.service.getAccountInfo("acct_nonexistent123")).rejects.toThrow();
    }, 15000);
  });
});
