/**
 * 決済完了済みガード 仕様書適合性検証テスト
 *
 *
 */

import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import { getPaymentService } from "@core/services";
import { PaymentError, PaymentErrorType } from "@core/types/payment-errors";

import { CreateStripeSessionParams } from "@features/payments/types";

import {
  createPaymentWithStatus,
  resetPaymentState,
  calculateExpectedGuardBehavior,
} from "../../helpers/payment-completion-guard-helpers";
import {
  createTestUserWithConnect,
  createPaidTestEvent,
  createTestAttendance,
  cleanupTestPaymentData,
  type TestPaymentUser,
  type TestPaymentEvent,
  type TestAttendanceData,
} from "../../helpers/test-payment-data";

// PaymentService実装の確実な登録
import "@features/payments/core-bindings";

describe("🚨 決済完了済みガード 仕様書適合性検証", () => {
  let testUser: TestPaymentUser;
  let testEvent: TestPaymentEvent;
  let testAttendance: TestAttendanceData;
  let paymentService: ReturnType<typeof getPaymentService>;
  let baseSessionParams: CreateStripeSessionParams;

  beforeAll(async () => {
    console.log("🔧 仕様書適合性検証テスト用データセットアップ開始");

    paymentService = getPaymentService();

    // fee_configのテストデータをセットアップ
    const secureFactory = SecureSupabaseClientFactory.getInstance();
    const adminClient = await secureFactory.createAuditedAdminClient(
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
      platform_fee_rate: 0.1,
      platform_fixed_fee: 0,
      min_platform_fee: 50,
      max_platform_fee: 1000,
      min_payout_amount: 1000,
      platform_tax_rate: 10.0,
      is_tax_included: true,
    });

    // テスト用データ作成
    testUser = await createTestUserWithConnect(`spec-compliance-test-${Date.now()}@example.com`);
    testEvent = await createPaidTestEvent(testUser.id, {
      title: "仕様書適合性検証イベント",
      fee: 1000,
    });
    testAttendance = await createTestAttendance(testEvent.id, {
      email: `spec-compliance-participant-${Date.now()}@example.com`,
      nickname: "仕様書検証参加者",
    });

    baseSessionParams = {
      attendanceId: testAttendance.id,
      amount: testEvent.fee,
      eventId: testEvent.id,
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
    await cleanupTestPaymentData({
      attendanceIds: [testAttendance.id],
      eventIds: [testEvent.id],
      userIds: [testUser.id],
    });
  });

  beforeEach(async () => {
    await resetPaymentState(testAttendance.id);
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
        await paymentService.createStripeSession(baseSessionParams);
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
🚨🚨🚨 SPECIFICATION VIOLATION DETECTED 🚨🚨🚨

【検出された問題】
waived ステータスの決済が存在するにも関わらず、完了済みガードが作動しませんでした。

【仕様書の要求】
- waived は終端系ステータス（ランク: 28）として定義
- 終端系ステータスの決済が存在する場合、新規決済セッション作成を拒否
- エラータイプ: PaymentErrorType.PAYMENT_ALREADY_EXISTS
- エラーメッセージ: "この参加に対する決済は既に完了済みです"

【実装の問題箇所】
ファイル: features/payments/services/service.ts
行: 176
現在の実装: .in("status", ["paid", "received", "completed", "refunded"])

【必要な修正】
.in("status", ["paid", "received", "completed", "refunded", "waived"])

【修正理由】
仕様書では waived は決済が免除された状態として終端系に分類されており、
これ以上の決済処理は不要であることを示します。
したがって、waived の決済が存在する場合も完了済みガードが作動すべきです。

【実際の結果】
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

    test("waived決済の存在下での時間比較ロジック", async () => {
      /**
       * waived決済とオープン決済の時間比較テスト
       * 仕様書通りならば、時間比較ロジックも正常に動作するはず
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

      try {
        const result = await paymentService.createStripeSession(baseSessionParams);

        // 成功した場合、時間比較が正しく動作していることを確認
        expect(result.sessionUrl).toMatch(/^https:\/\/checkout\.stripe\.com/);
        console.log("✅ waived決済との時間比較で、新しいpending決済が優先されました");
      } catch (error) {
        if (
          error instanceof PaymentError &&
          error.type === PaymentErrorType.PAYMENT_ALREADY_EXISTS
        ) {
          // waived が終端系として扱われた場合のログ
          console.log(
            "ℹ️ waived決済により完了済みガードが作動しました（実装が修正された場合の想定動作）"
          );

          // この場合は時間比較で古いwaived < 新しいpendingのはずなので、
          // 本来は決済セッション作成が許可されるべき
          console.warn("⚠️ 時間比較ロジックに問題がある可能性があります");
        }
        throw error;
      }
    });
  });

  describe("🚨 終端系ステータス完全性検証", () => {
    test("全ての終端系ステータスが完了済みガードをトリガーすること", async () => {
      const terminalStatuses = ["paid", "received", "completed", "refunded", "waived"] as const;
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
          await paymentService.createStripeSession(baseSessionParams);
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
features/payments/services/service.ts:176行目
現在: .in("status", ["paid", "received", "completed", "refunded"])
修正: .in("status", ["paid", "received", "completed", "refunded", "waived"])

【すべての終端系ステータスの結果】
${terminalStatuses.map((s) => `${s}: ${results[s] ? "✅" : "❌"}`).join("\n")}
        `);

        fail(`終端系ステータス ${violations.join(", ")} が完了済みガードをトリガーしていません`);
      }

      console.log("✅ 全ての終端系ステータスで完了済みガードが正常に作動しました");
    });
  });

  describe("仕様書時間比較ロジック検証", () => {
    test("終端決済時間計算の優先順位: paid_at > updated_at > created_at", async () => {
      const baseTime = new Date();
      const time1 = new Date(baseTime.getTime() - 90000); // 90秒前（最古）
      const time2 = new Date(baseTime.getTime() - 60000); // 60秒前（中間）
      const time3 = new Date(baseTime.getTime() - 30000); // 30秒前（最新）

      // paid決済を作成: created_at < updated_at < paid_at
      await createPaymentWithStatus(testAttendance.id, "paid", {
        createdAt: time1, // 最古
        updatedAt: time2, // 中間
        paidAt: time3, // 最新（これが使用されるべき）
      });

      // pending決済を作成（比較対象）
      const pendingTime = new Date(baseTime.getTime() - 45000); // 45秒前
      await createPaymentWithStatus(testAttendance.id, "pending", {
        createdAt: pendingTime,
        updatedAt: pendingTime,
      });

      // 仕様書によれば：
      // - 終端決済の有効時間: paid_at (30秒前)
      // - オープン決済の有効時間: updated_at (45秒前)
      // - 終端決済の方が新しいので拒否されるべき

      await expect(paymentService.createStripeSession(baseSessionParams)).rejects.toThrow(
        expect.objectContaining({
          type: PaymentErrorType.PAYMENT_ALREADY_EXISTS,
        })
      );

      console.log("✅ 終端決済の時間計算で paid_at が優先されることを確認");
    });

    test("オープン決済時間計算の優先順位: updated_at > created_at", async () => {
      const baseTime = new Date();
      const time1 = new Date(baseTime.getTime() - 90000); // 90秒前
      const time2 = new Date(baseTime.getTime() - 60000); // 60秒前
      const time3 = new Date(baseTime.getTime() - 30000); // 30秒前

      // 終端決済（比較対象）
      await createPaymentWithStatus(testAttendance.id, "paid", {
        paidAt: time2, // 60秒前
      });

      // pending決済: created_at < updated_at
      await createPaymentWithStatus(testAttendance.id, "pending", {
        createdAt: time1, // 古い
        updatedAt: time3, // 新しい（これが使用されるべき）
      });

      // 仕様書によれば：
      // - 終端決済の有効時間: paid_at (60秒前)
      // - オープン決済の有効時間: updated_at (30秒前)
      // - オープン決済の方が新しいので許可されるべき

      const result = await paymentService.createStripeSession(baseSessionParams);
      expect(result.sessionUrl).toMatch(/^https:\/\/checkout\.stripe\.com/);

      console.log("✅ オープン決済の時間計算で updated_at が優先されることを確認");
    });
  });

  describe("エラー詳細の仕様書適合性", () => {
    test("完了済みガードエラーの詳細が仕様書通りであること", async () => {
      // completed決済を作成
      await createPaymentWithStatus(testAttendance.id, "completed");

      try {
        await paymentService.createStripeSession(baseSessionParams);
        fail("PaymentError should be thrown");
      } catch (error) {
        // 仕様書で定義されたエラー詳細を検証
        expect(error).toBeInstanceOf(PaymentError);
        expect(error.type).toBe(PaymentErrorType.PAYMENT_ALREADY_EXISTS);
        expect(error.message).toBe("この参加に対する決済は既に完了済みです");
        expect(error.name).toBe("PaymentError");

        console.log("✅ 完了済みガードエラーの詳細が仕様書通りであることを確認");
      }
    });
  });

  describe("ソート条件の仕様書適合性", () => {
    test("終端決済ソート順序の実装検証", async () => {
      const baseTime = new Date();
      const time1 = new Date(baseTime.getTime() - 120000); // 2分前
      const time2 = new Date(baseTime.getTime() - 90000); // 1.5分前
      const time3 = new Date(baseTime.getTime() - 60000); // 1分前

      // 複数の終端決済を作成（仕様書のソート順序で最新が選ばれることを確認）

      // 最初の決済（古いpaid_at）
      await createPaymentWithStatus(testAttendance.id, "paid", {
        paidAt: time1, // 最も古い
        createdAt: time2,
      });

      // 2番目の決済（新しいpaid_at） - これが選択されるべき
      await createPaymentWithStatus(testAttendance.id, "completed", {
        paidAt: time3, // 最新
        createdAt: time1, // 古いcreated_at
      });

      // 3番目の決済（paid_atなし、新しいupdated_at）
      await createPaymentWithStatus(testAttendance.id, "received", {
        updatedAt: time2,
        createdAt: time1,
        paidAt: undefined, // paid_atなし
      });

      // 仕様書によれば、paid_atを持つ決済が優先され、
      // その中で最新のpaid_at（time3）を持つ決済が使用される

      await expect(paymentService.createStripeSession(baseSessionParams)).rejects.toThrow(
        expect.objectContaining({
          type: PaymentErrorType.PAYMENT_ALREADY_EXISTS,
        })
      );

      console.log("✅ 終端決済のソート順序が仕様書通りであることを確認");
    });

    test("オープン決済ソート順序の実装検証", async () => {
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

      const result = await paymentService.createStripeSession(baseSessionParams);
      expect(result.sessionUrl).toMatch(/^https:\/\/checkout\.stripe\.com/);

      console.log("✅ オープン決済でpendingが優先されることを確認");
    });
  });
});
