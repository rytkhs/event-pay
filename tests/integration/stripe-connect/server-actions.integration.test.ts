/**
 * Server Actions Integration Tests
 */
import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import { logger } from "@core/logging/app-logger";
import {
  setupStripeConnectRealApiTest,
  type StripeConnectRealApiTestSetup,
} from "./stripe-connect-real-api-test-setup";

describe("Server Actions Integration Tests", () => {
  let setup: StripeConnectRealApiTestSetup;

  beforeAll(async () => {
    setup = await setupStripeConnectRealApiTest();
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  describe("UI Status Mapping", () => {
    it("should return no_account UI status when account does not exist", async () => {
      const { UIStatusMapper } = await import("@features/stripe-connect/server");
      const mapper = new UIStatusMapper();
      const uiStatus = mapper.mapToUIStatus(null);
      expect(uiStatus).toBe("no_account");
      logger.info("no_account UI status test passed");
    });

    it("should map restricted status correctly", async () => {
      const { UIStatusMapper } = await import("@features/stripe-connect/server");
      const mapper = new UIStatusMapper();
      const uiStatus = mapper.mapToUIStatus("restricted");
      expect(uiStatus).toBe("restricted");
      logger.info("restricted UI status mapping test passed");
    });
  });

  describe("StatusSyncService", () => {
    it("should sync account status", async () => {
      const createResult = await setup.service.createExpressAccount({
        userId: setup.testUser.id,
        email: "test" + Date.now() + "@example.com",
        country: "JP",
        businessType: "individual",
      });
      setup.createdStripeAccountIds.push(createResult.accountId);

      const { StatusSyncService } = await import("@features/stripe-connect/server");
      const statusSyncService = new StatusSyncService(setup.service);

      const stripeAccount = await statusSyncService.syncAccountStatus(
        setup.testUser.id,
        createResult.accountId,
        {
          maxRetries: 3,
        }
      );

      expect(stripeAccount).toBeDefined();
      expect(stripeAccount.id).toBe(createResult.accountId);

      const account = await setup.service.getConnectAccountByUser(setup.testUser.id);
      expect(account).toBeDefined();
      logger.info("Status sync test passed");
    }, 30000);
  });
});
