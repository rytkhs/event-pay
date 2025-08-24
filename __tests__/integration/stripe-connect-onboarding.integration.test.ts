/**
 * Stripe Connect オンボーディングフローの統合テスト
 */

import { jest } from "@jest/globals";
import { createAdminStripeConnectService } from "@/lib/services/stripe-connect";
import { StripeConnectError, StripeConnectErrorType } from "@/lib/services/stripe-connect/types";
import { AdminReason } from "@/lib/security/secure-client-factory.types";

// 統合テスト用の環境変数チェック
const requiredEnvVars = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
};

const hasRequiredEnvVars = Object.values(requiredEnvVars).every(Boolean);

describe("Stripe Connect Onboarding Integration", () => {
  // 環境変数が設定されていない場合はテストをスキップ
  const describeOrSkip = hasRequiredEnvVars ? describe : describe.skip;

  describeOrSkip("オンボーディングフロー", () => {
    let service: Awaited<ReturnType<typeof createAdminStripeConnectService>>;
    const testUserId = `test-user-${Date.now()}`;
    const testEmail = `test-${Date.now()}@example.com`;

    beforeEach(async () => {
      service = await createAdminStripeConnectService(
        AdminReason.TEST_DATA_SETUP,
        "Stripe Connect onboarding integration test"
      );
    });

    afterEach(async () => {
      // テスト後のクリーンアップ
      try {
        const account = await service.getConnectAccountByUser(testUserId);
        if (account) {
          // 実際の環境では手動でのクリーンアップが必要
          console.log(`Test account created: ${account.stripe_account_id}`);
        }
      } catch (error) {
        // クリーンアップエラーは無視
      }
    });

    it("完全なオンボーディングフローが正常に動作する", async () => {
      // 1. 初期状態：アカウントが存在しないことを確認
      const initialAccount = await service.getConnectAccountByUser(testUserId);
      expect(initialAccount).toBeNull();

      // 2. Express Accountを作成
      const createResult = await service.createExpressAccount({
        userId: testUserId,
        email: testEmail,
        country: "JP",
        businessType: "individual",
      });

      expect(createResult.accountId).toBeDefined();
      expect(createResult.status).toBe("unverified");

      // 3. 作成されたアカウントを取得
      const createdAccount = await service.getConnectAccountByUser(testUserId);
      expect(createdAccount).not.toBeNull();
      expect(createdAccount!.stripe_account_id).toBe(createResult.accountId);
      expect(createdAccount!.status).toBe("unverified");
      expect(createdAccount!.charges_enabled).toBe(false);
      expect(createdAccount!.payouts_enabled).toBe(false);

      // 4. Account Linkを生成
      const accountLink = await service.createAccountLink({
        accountId: createResult.accountId,
        refreshUrl: "http://localhost:3000/refresh",
        returnUrl: "http://localhost:3000/return",
        type: "account_onboarding",
      });

      expect(accountLink.url).toMatch(/^https:\/\/connect\.stripe\.com/);
      expect(accountLink.expiresAt).toBeGreaterThan(Date.now());

      // 5. Stripeからアカウント情報を取得
      const accountInfo = await service.getAccountInfo(createResult.accountId);
      expect(accountInfo.accountId).toBe(createResult.accountId);
      expect(accountInfo.status).toBe("unverified");
      expect(accountInfo.chargesEnabled).toBe(false);
      expect(accountInfo.payoutsEnabled).toBe(false);

      // 6. アカウントステータスを更新（オンボーディング完了をシミュレート）
      await service.updateAccountStatus({
        userId: testUserId,
        status: "verified",
        chargesEnabled: true,
        payoutsEnabled: true,
      });

      // 7. 更新されたアカウント情報を確認
      const updatedAccount = await service.getConnectAccountByUser(testUserId);
      expect(updatedAccount!.status).toBe("verified");
      expect(updatedAccount!.charges_enabled).toBe(true);
      expect(updatedAccount!.payouts_enabled).toBe(true);
    });

    it("重複アカウント作成時にエラーが発生する", async () => {
      // 1. 最初のアカウントを作成
      await service.createExpressAccount({
        userId: testUserId,
        email: testEmail,
        country: "JP",
        businessType: "individual",
      });

      // 2. 同じユーザーで再度アカウント作成を試行
      await expect(
        service.createExpressAccount({
          userId: testUserId,
          email: testEmail,
          country: "JP",
          businessType: "individual",
        })
      ).rejects.toThrow(StripeConnectError);

      try {
        await service.createExpressAccount({
          userId: testUserId,
          email: testEmail,
          country: "JP",
          businessType: "individual",
        });
      } catch (error) {
        expect(error).toBeInstanceOf(StripeConnectError);
        expect((error as StripeConnectError).type).toBe(StripeConnectErrorType.ACCOUNT_ALREADY_EXISTS);
      }
    });

    it("存在しないアカウントIDでAccount Link生成時にエラーが発生する", async () => {
      const invalidAccountId = "acct_invalid123";

      await expect(
        service.createAccountLink({
          accountId: invalidAccountId,
          refreshUrl: "http://localhost:3000/refresh",
          returnUrl: "http://localhost:3000/return",
          type: "account_onboarding",
        })
      ).rejects.toThrow(StripeConnectError);
    });

    it("アカウント情報の同期が正常に動作する", async () => {
      // 1. アカウントを作成
      const createResult = await service.createExpressAccount({
        userId: testUserId,
        email: testEmail,
        country: "JP",
        businessType: "individual",
      });

      // 2. データベースの情報を手動で更新（同期テスト用）
      await service.updateAccountStatus({
        userId: testUserId,
        status: "onboarding",
        chargesEnabled: false,
        payoutsEnabled: false,
      });

      // 3. Stripeから最新情報を取得
      const accountInfo = await service.getAccountInfo(createResult.accountId);

      // 4. データベースの情報と比較（実際のStripeの状態と異なる場合）
      const dbAccount = await service.getConnectAccountByUser(testUserId);

      // この時点では、データベースは"onboarding"だが、Stripeは"unverified"の可能性がある
      // 実際のアプリケーションでは、この差異を検知して同期する
      if (dbAccount!.status !== accountInfo.status) {
        await service.updateAccountStatus({
          userId: testUserId,
          status: accountInfo.status,
          chargesEnabled: accountInfo.chargesEnabled,
          payoutsEnabled: accountInfo.payoutsEnabled,
        });

        // 5. 同期後の確認
        const syncedAccount = await service.getConnectAccountByUser(testUserId);
        expect(syncedAccount!.status).toBe(accountInfo.status);
        expect(syncedAccount!.charges_enabled).toBe(accountInfo.chargesEnabled);
        expect(syncedAccount!.payouts_enabled).toBe(accountInfo.payoutsEnabled);
      }
    });
  });

  // 環境変数が設定されていない場合の警告
  if (!hasRequiredEnvVars) {
    console.warn("Stripe Connect integration tests skipped: Missing required environment variables");
    console.warn("Required:", Object.keys(requiredEnvVars).join(", "));
  }
});
