/**
 * StripeConnectService の統合テスト
 */

import { createAdminStripeConnectService } from "@/lib/services/stripe-connect";
import { AdminReason } from "@/lib/security/secure-client-factory.types";

// 統合テスト用の環境変数チェック
const requiredEnvVars = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

const hasRequiredEnvVars = Object.values(requiredEnvVars).every(Boolean);

describe("StripeConnectService Integration", () => {
  // 環境変数が設定されていない場合はテストをスキップ
  const describeOrSkip = hasRequiredEnvVars ? describe : describe.skip;

  describeOrSkip("サービスインスタンス作成", () => {
    it("正常にサービスインスタンスを作成できる", async () => {
      const service = await createAdminStripeConnectService(
        AdminReason.TEST_DATA_SETUP,
        "StripeConnectService integration test"
      );

      expect(service).toBeDefined();
      expect(typeof service.createExpressAccount).toBe("function");
      expect(typeof service.createAccountLink).toBe("function");
      expect(typeof service.getAccountInfo).toBe("function");
      expect(typeof service.getConnectAccountByUser).toBe("function");
      expect(typeof service.updateAccountStatus).toBe("function");
      expect(typeof service.isChargesEnabled).toBe("function");
      expect(typeof service.isPayoutsEnabled).toBe("function");
      expect(typeof service.isAccountVerified).toBe("function");
    });
  });

  describeOrSkip("バリデーション", () => {
    let service: Awaited<ReturnType<typeof createAdminStripeConnectService>>;

    beforeEach(async () => {
      service = await createAdminStripeConnectService(
        AdminReason.TEST_DATA_SETUP,
        "StripeConnectService validation test"
      );
    });

    it("無効なユーザーIDでgetConnectAccountByUserを呼ぶとバリデーションエラーが発生する", async () => {
      await expect(service.getConnectAccountByUser("invalid-uuid")).rejects.toThrow();
    });

    it("無効なStripe Account IDでgetAccountInfoを呼ぶとバリデーションエラーが発生する", async () => {
      await expect(service.getAccountInfo("invalid-account-id")).rejects.toThrow();
    });
  });

  // 実際のStripe APIを呼び出すテストは、テスト環境でのみ実行
  // 本番環境では実行しないよう注意
  if (process.env.NODE_ENV === "test" && process.env.STRIPE_TEST_MODE === "true") {
    describeOrSkip("Stripe API連携", () => {
      let service: ReturnType<typeof createStripeConnectService>;

      beforeEach(async () => {
        service = await createAdminStripeConnectService(
          AdminReason.TEST_DATA_SETUP,
          "StripeConnectService account info test"
        );
      });

      it("存在しないStripe Account IDでgetAccountInfoを呼ぶとエラーが発生する", async () => {
        await expect(service.getAccountInfo("acct_nonexistent123")).rejects.toThrow();
      });
    });
  }
});
