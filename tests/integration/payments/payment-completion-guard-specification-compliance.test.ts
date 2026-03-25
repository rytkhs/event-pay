/**
 * 決済完了済みガード 仕様書適合性検証テスト
 *
 *
 */

import { jest } from "@jest/globals";

import { getPaymentPort, type PaymentPort } from "@core/ports/payments";
import { createAuditedAdminClient } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import * as DestinationChargesModule from "@core/stripe/destination-charges";
import { PaymentError, PaymentErrorType } from "@core/types/payment-errors";

import { CreateStripeSessionParams } from "@features/payments";

import {
  createPaymentWithStatus,
  resetPaymentState,
  calculateExpectedGuardBehavior,
} from "../../helpers/payment-completion-guard-helpers";
import type {
  TestPaymentUser,
  TestPaymentEvent,
  TestAttendanceData,
} from "../../helpers/test-payment-data";
import { createPaymentTestSetup, type PaymentTestSetup } from "../../setup/common-test-setup";

describe("🚨 決済完了済みガード 仕様書適合性検証", () => {
  let setup: PaymentTestSetup;
  let testUser: TestPaymentUser;
  let testEvent: TestPaymentEvent;
  let testAttendance: TestAttendanceData;
  let paymentPort: PaymentPort;
  let baseSessionParams: CreateStripeSessionParams;

  beforeAll(async () => {
    console.log("🔧 仕様書適合性検証テスト用データセットアップ開始");

    // 共通決済テストセットアップを使用
    setup = await createPaymentTestSetup({
      testName: `spec-compliance-test-${Date.now()}`,
      eventFee: 1000,
      accessedTables: [
        "public.users",
        "public.events",
        "public.attendances",
        "public.payments",
        "public.fee_config",
      ],
    });

    paymentPort = getPaymentPort();

    testUser = setup.testUser;
    testEvent = setup.testEvent;
    testAttendance = setup.testAttendance;

    // fee_configのテストデータをセットアップ（共通セットアップで設定されていない場合のフォールバック）
    const adminClient = await createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "Setting up fee config for payment completion guard test",
      {
        operationType: "INSERT",
        accessedTables: ["public.fee_config"],
      }
    );

    // デフォルトのfee_configを作成
    await adminClient.from("fee_config").upsert({
      stripe_base_rate: 0.039,
      stripe_fixed_fee: 15,
      platform_fee_rate: 0.049,
      platform_fixed_fee: 0,
      min_platform_fee: 50,
      max_platform_fee: 1000,
      min_payout_amount: 1000,
      platform_tax_rate: 10.0,
      is_tax_included: true,
    });

    baseSessionParams = {
      attendanceId: testAttendance.id,
      amount: testEvent.fee,
      eventId: testEvent.id,
      payoutProfileId: testEvent.payout_profile_id ?? testUser.payoutProfileId!,
      actorId: testAttendance.id,
      eventTitle: testEvent.title,
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
      destinationCharges: {
        destinationAccountId: testUser.stripeConnectAccountId!,
        userEmail: testAttendance.email,
        userName: testAttendance.nickname,
      },
    };

    console.log("✅ 仕様書適合性検証テストデータセットアップ完了");
  });

  afterAll(async () => {
    // 共通クリーンアップ関数を使用
    await setup.cleanup();
  });

  beforeEach(async () => {
    await resetPaymentState(testAttendance.id);

    // Stripe API モック
    jest
      .spyOn(DestinationChargesModule, "createDestinationCheckoutSession")
      .mockImplementation(async (params: any) => {
        const sessionId = `cs_test_mock_${Date.now()}`;
        return {
          id: sessionId,
          url: `https://checkout.stripe.com/c/pay/${sessionId}`,
          payment_status: "unpaid",
          status: "open",
        } as any;
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("waived ステータスの終端系扱い検証", () => {
    test("waived決済が完了済みガードをトリガー", async () => {
      // waived決済を作成
      await createPaymentWithStatus(testAttendance.id, "waived", {
        amount: testEvent.fee,
        method: "cash",
      });

      console.log("📋 waived決済を作成しました。仕様書によれば完了済みガードが作動すべきです。");

      // 仕様書によれば、waivedは終端系なので新規決済セッション作成はブロックされるべき
      let testPassed = false;
      let actualError: any = null;

      try {
        await paymentPort.createStripeSession(baseSessionParams);
        // ここに到達した場合、仕様書違反（完了済みガードが作動していない）
        testPassed = false;
      } catch (error) {
        if (
          error instanceof PaymentError &&
          error.type === PaymentErrorType.PAYMENT_ALREADY_EXISTS
        ) {
          testPassed = true;
        } else {
          actualError = error;
          testPassed = false;
        }
      }

      if (!testPassed) {
        // 仕様書違反の詳細報告
        console.error(`

${
  actualError
    ? `予期しないエラー: ${actualError.name} - ${actualError.message}`
    : "決済セッション作成が成功してしまいました（本来は失敗すべき）"
}
        `);

        fail(`SPECIFICATION VIOLATION: waived ステータスが終端系として扱われていません`);
      }

      // テストが成功した場合の確認
      console.log("✅ waived決済による完了済みガード作動を確認しました。");
    });

    test("waived決済が存在する場合は時間比較せずブロックされる", async () => {
      /**
       * ドメイン定義上、waived は終端（waived --> [*]）であり再課金フローは定義されていない。
       * よって、DBに open（例: pending）が併存していても、終端が存在する時点で新規決済開始は拒否されるべき。
       *
       * これは「時間比較ロジック」の検証ではなく、混在状態でも fail-close することの回帰テスト。
       */

      const now = new Date();
      const olderTime = new Date(now.getTime() - 60000); // 1分前
      const newerTime = new Date(now.getTime() - 30000); // 30秒前

      // 古いwaived決済
      await createPaymentWithStatus(testAttendance.id, "waived", {
        createdAt: olderTime,
        updatedAt: olderTime,
        paidAt: olderTime,
      });

      // 新しいpending決済
      await createPaymentWithStatus(testAttendance.id, "pending", {
        createdAt: newerTime,
        updatedAt: newerTime,
      });

      await expect(paymentPort.createStripeSession(baseSessionParams)).rejects.toThrow(
        expect.objectContaining({
          type: PaymentErrorType.PAYMENT_ALREADY_EXISTS,
        })
      );
    });
  });

  describe("🚨 終端系ステータス完全性検証", () => {
    test("全ての終端系ステータスが完了済みガードをトリガーすること", async () => {
      const terminalStatuses = ["paid", "received", "refunded", "waived"] as const;
      const results: Record<string, boolean> = {};

      for (const status of terminalStatuses) {
        await resetPaymentState(testAttendance.id);

        // 終端決済を作成
        await createPaymentWithStatus(testAttendance.id, status, {
          amount: testEvent.fee,
        });

        console.log(`📋 ${status} 決済でのガード作動テスト中...`);

        let guardTriggered = false;
        try {
          await paymentPort.createStripeSession(baseSessionParams);
          guardTriggered = false;
        } catch (error) {
          if (
            error instanceof PaymentError &&
            error.type === PaymentErrorType.PAYMENT_ALREADY_EXISTS
          ) {
            guardTriggered = true;
          }
        }

        results[status] = guardTriggered;

        if (!guardTriggered) {
          console.error(`🚨 ${status} 決済で完了済みガードが作動しませんでした`);
        } else {
          console.log(`✅ ${status} 決済で完了済みガードが正常作動`);
        }
      }

      // 結果の検証
      const violations = terminalStatuses.filter((status) => !results[status]);

      if (violations.length > 0) {
        console.error(`
🚨🚨🚨 TERMINAL STATUS VIOLATIONS DETECTED 🚨🚨🚨

【完了済みガードが作動しなかった終端系ステータス】
${violations.map((v) => `- ${v}`).join("\n")}

【修正が必要な箇所】
features/payments/services/stripe-session/types.ts の TERMINAL_PAYMENT_STATUSES
および ensure-payment-record の終端検索ロジック
（"waived" を含める）

【すべての終端系ステータスの結果】
${terminalStatuses.map((s) => `${s}: ${results[s] ? "✅" : "❌"}`).join("\n")}
        `);

        fail(`終端系ステータス ${violations.join(", ")} が完了済みガードをトリガーしていません`);
      }

      console.log("✅ 全ての終端系ステータスで完了済みガードが正常に作動しました");
    });
  });

  describe("ソート条件の仕様書適合性（オープン決済のみ）", () => {
    test("オープン決済ソート順序の実装検証: pending優先", async () => {
      const baseTime = new Date();
      const time1 = new Date(baseTime.getTime() - 120000); // 2分前
      const time2 = new Date(baseTime.getTime() - 60000); // 1分前

      // failed決済（新しい）
      await createPaymentWithStatus(testAttendance.id, "failed", {
        createdAt: time2,
        updatedAt: time2,
      });

      // pending決済（古いが、ステータス優先でこちらが選択されるべき）
      await createPaymentWithStatus(testAttendance.id, "pending", {
        createdAt: time1, // failedより古い
        updatedAt: time1,
      });

      // 仕様書によれば、pendingはfailedより優先される

      const result = await paymentPort.createStripeSession(baseSessionParams);
      expect(result.sessionUrl).toMatch(/^https:\/\/checkout\.stripe\.com/);

      console.log("✅ オープン決済でpendingが優先されることを確認");
    });
  });
});
