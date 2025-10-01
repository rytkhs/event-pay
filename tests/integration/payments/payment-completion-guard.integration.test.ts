/**
 * 決済完了済みガード統合テスト
 *
 * 仕様書: docs/spec/test/stripe/payment-completion-guard.md
 *
 * 目的：
 * 決済完了済みガードが仕様書通りに動作することを厳密に検証する。
 * 特に、仕様書と実装の差異を明確に検出し、不整合を指摘する。
 *
 * 統合テスト特徴：
 * - ✅ 実際のSupabase接続（テストDB）
 * - ✅ 実際のPaymentService実装使用
 * - ✅ 実際のStripe Test Mode使用
 * - ✅ 仕様書ベースの期待値検証
 * - ❌ 外部モックなし（真の統合テスト）
 *
 * 重要：
 * - プロダクションコードの実装に合わせてテストの期待値を変更しない
 * - テストの期待値は「仕様書」に基づいて設定する
 * - プロダクションコードが仕様書と異なる場合、テストを失敗させる
 * - その上で、プロダクションコードのどの部分に問題があり、どのように修正すべきかを指摘する
 */

import { jest } from "@jest/globals";

import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import { getPaymentService } from "@core/services";
import { PaymentError, PaymentErrorType } from "@core/types/payment-errors";
import { statusRank } from "@core/utils/payments/status-rank";

import { CreateStripeSessionParams } from "@features/payments/types";

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

// 仕様書から抽出した期待値
const SPEC_STATUS_RANKS = {
  pending: 10,
  failed: 15,
  paid: 20,
  received: 20, // paidと同じランク（両方とも「支払い完了」状態）
  waived: 25,
  refunded: 40,
} as const;

const SPEC_TERMINAL_STATUSES = ["paid", "received", "refunded", "waived"] as const;
const SPEC_OPEN_STATUSES = ["pending", "failed"] as const;

describe("決済完了済みガード統合テスト", () => {
  // テストデータ
  let testUser: TestPaymentUser;
  let testEvent: TestPaymentEvent;
  let testAttendance: TestAttendanceData;
  let paymentService: ReturnType<typeof getPaymentService>;
  let adminClient: any;

  beforeAll(async () => {
    // 実際のDBにテストデータを作成
    console.log("🔧 決済完了済みガード統合テスト用データセットアップ開始");

    // PaymentService実装を取得
    paymentService = getPaymentService();

    // 管理者クライアントを作成
    const secureFactory = SecureSupabaseClientFactory.getInstance();
    adminClient = await secureFactory.createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "Payment completion guard integration test setup",
      {
        operationType: "INSERT",
        accessedTables: ["public.users", "public.events", "public.attendances", "public.payments"],
        additionalInfo: { testContext: "payment-completion-guard-integration" },
      }
    );

    // テスト用データ作成
    testUser = await createTestUserWithConnect(`completion-guard-test-${Date.now()}@example.com`);
    testEvent = await createPaidTestEvent(testUser.id, {
      title: "決済完了済みガードテストイベント",
      fee: 1000,
    });
    testAttendance = await createTestAttendance(testEvent.id, {
      email: `completion-guard-participant-${Date.now()}@example.com`,
      nickname: "完了ガードテスト参加者",
    });

    console.log(
      `✅ テストデータセットアップ完了 - Event: ${testEvent.id}, Attendance: ${testAttendance.id}`
    );
  });

  afterAll(async () => {
    // テストデータをクリーンアップ
    await cleanupTestPaymentData({
      attendanceIds: [testAttendance.id],
      eventIds: [testEvent.id],
      userIds: [testUser.id],
    });

    console.log("✅ テストデータクリーンアップ完了");
  });

  beforeEach(async () => {
    // 各テスト前に決済データをクリーンアップ
    await adminClient.from("payments").delete().eq("attendance_id", testAttendance.id);
  });

  describe("仕様書適合性検証", () => {
    test("ステータスランク値が仕様書通りであること", () => {
      // 仕様書の期待値と実装を比較
      Object.entries(SPEC_STATUS_RANKS).forEach(([status, expectedRank]) => {
        const actualRank = statusRank(status as any);
        expect(actualRank).toBe(expectedRank);
      });
    });

    test("終端系ステータスの定義が仕様書通りであること - CRITICAL TEST", async () => {
      /**
       * 🚨 CRITICAL: 仕様書と実装の重要な差異検証
       *
       * 仕様書では `waived` が終端系ステータス（ランク: 28）として定義されているが、
       * 実装（features/payments/services/service.ts:176）では終端系に含まれていない。
       *
       * 期待される動作（仕様書ベース）：
       * - `waived` ステータスの決済が存在する場合、完了済みガードが作動する
       *
       * 実装の動作：
       * - `waived` ステータスの決済が存在しても、完了済みガードが作動しない
       *
       * これは仕様書と実装の重大な不整合である。
       */

      // waived状態の決済を作成
      const { data: waivedPayment, error: insertError } = await adminClient
        .from("payments")
        .insert({
          attendance_id: testAttendance.id,
          method: "cash",
          amount: testEvent.fee,
          status: "waived",
          paid_at: new Date().toISOString(),
        })
        .select()
        .single();

      expect(insertError).toBeNull();
      console.log(`✓ waived決済作成: ${waivedPayment.id}`);

      // 新規決済セッション作成を試行
      const sessionParams: CreateStripeSessionParams = {
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

      // 仕様書によれば、waivedは終端系なので完了済みガードが作動すべき
      await expect(paymentService.createStripeSession(sessionParams)).rejects.toThrow(
        expect.objectContaining({
          type: PaymentErrorType.PAYMENT_ALREADY_EXISTS,
          message: "この参加に対する決済は既に完了済みです",
        })
      );

      // 🚨 このテストが失敗した場合の指摘事項:
      //
      // 【問題箇所】
      // features/payments/services/service.ts:176行目
      // `.in("status", ["paid", "received", "refunded"])`
      //
      // 【修正方法】
      // `.in("status", ["paid", "received", "refunded", "waived"])`
      //
      // 【理由】
      // 仕様書では waived は終端系ステータス（ランク: 28）として定義されており、
      // 決済が免除された状態も完了済みとして扱うべきである。
      // 現在の実装では waived の決済があっても新しい決済セッションが作成できてしまう。
    });
  });

  describe("完了済みガード基本動作", () => {
    test("新規決済作成 - 決済記録なし", async () => {
      const sessionParams: CreateStripeSessionParams = {
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

      const result = await paymentService.createStripeSession(sessionParams);

      expect(result).toHaveProperty("sessionUrl");
      expect(result).toHaveProperty("sessionId");
      expect(result.sessionUrl).toMatch(/^https:\/\/checkout\.stripe\.com/);

      // 作成された決済を確認
      const { data: payment } = await adminClient
        .from("payments")
        .select("*")
        .eq("attendance_id", testAttendance.id)
        .single();

      expect(payment.status).toBe("pending");
      expect(payment.amount).toBe(testEvent.fee);
    });

    test("pending決済の再利用", async () => {
      // pending決済を事前作成
      const { data: pendingPayment } = await adminClient
        .from("payments")
        .insert({
          attendance_id: testAttendance.id,
          method: "stripe",
          amount: testEvent.fee,
          status: "pending",
        })
        .select()
        .single();

      const sessionParams: CreateStripeSessionParams = {
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

      const result = await paymentService.createStripeSession(sessionParams);

      expect(result.sessionUrl).toMatch(/^https:\/\/checkout\.stripe\.com/);

      // 既存の決済が再利用されていることを確認
      const { data: payments } = await adminClient
        .from("payments")
        .select("*")
        .eq("attendance_id", testAttendance.id);

      expect(payments).toHaveLength(1);
      expect(payments[0].id).toBe(pendingPayment.id);
      expect(payments[0].status).toBe("pending");
    });

    test("failed決済存在時の新規pending作成", async () => {
      // failed決済を事前作成
      await adminClient.from("payments").insert({
        attendance_id: testAttendance.id,
        method: "stripe",
        amount: testEvent.fee,
        status: "failed",
      });

      const sessionParams: CreateStripeSessionParams = {
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

      const result = await paymentService.createStripeSession(sessionParams);

      expect(result.sessionUrl).toMatch(/^https:\/\/checkout\.stripe\.com/);

      // 新規pending決済が作成されていることを確認
      const { data: payments } = await adminClient
        .from("payments")
        .select("*")
        .eq("attendance_id", testAttendance.id)
        .order("created_at", { ascending: false });

      expect(payments).toHaveLength(2);
      expect(payments[0].status).toBe("pending"); // 新規作成
      expect(payments[1].status).toBe("failed"); // 既存
    });
  });

  describe("完了済みガード発動条件", () => {
    test("paid決済存在時の拒否", async () => {
      // paid決済を事前作成
      await adminClient.from("payments").insert({
        attendance_id: testAttendance.id,
        method: "stripe",
        amount: testEvent.fee,
        status: "paid",
        paid_at: new Date().toISOString(),
        stripe_payment_intent_id: "pi_test_completed",
      });

      const sessionParams: CreateStripeSessionParams = {
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

      await expect(paymentService.createStripeSession(sessionParams)).rejects.toThrow(
        expect.objectContaining({
          type: PaymentErrorType.PAYMENT_ALREADY_EXISTS,
          message: "この参加に対する決済は既に完了済みです",
        })
      );
    });

    test("received決済存在時の拒否", async () => {
      // received決済を事前作成
      await adminClient.from("payments").insert({
        attendance_id: testAttendance.id,
        method: "cash",
        amount: testEvent.fee,
        status: "received",
        paid_at: new Date().toISOString(),
      });

      const sessionParams: CreateStripeSessionParams = {
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

      await expect(paymentService.createStripeSession(sessionParams)).rejects.toThrow(
        expect.objectContaining({
          type: PaymentErrorType.PAYMENT_ALREADY_EXISTS,
          message: "この参加に対する決済は既に完了済みです",
        })
      );
    });

    test("refunded決済存在時の拒否", async () => {
      // refunded決済を事前作成
      await adminClient.from("payments").insert({
        attendance_id: testAttendance.id,
        method: "stripe",
        amount: testEvent.fee,
        status: "refunded",
        paid_at: new Date(Date.now() - 60000).toISOString(), // 1分前
        stripe_payment_intent_id: "pi_test_refunded",
        refunded_amount: testEvent.fee,
      });

      const sessionParams: CreateStripeSessionParams = {
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

      await expect(paymentService.createStripeSession(sessionParams)).rejects.toThrow(
        expect.objectContaining({
          type: PaymentErrorType.PAYMENT_ALREADY_EXISTS,
          message: "この参加に対する決済は既に完了済みです",
        })
      );
    });
  });

  describe("時間比較ロジック", () => {
    test("終端決済が新しい場合の拒否", async () => {
      const now = new Date();
      const olderTime = new Date(now.getTime() - 60000); // 1分前
      const newerTime = new Date(now.getTime() - 30000); // 30秒前

      // 古いpending決済を作成
      await adminClient.from("payments").insert({
        attendance_id: testAttendance.id,
        method: "stripe",
        amount: testEvent.fee,
        status: "pending",
        created_at: olderTime.toISOString(),
        updated_at: olderTime.toISOString(),
      });

      // 新しいpaid決済を作成
      await adminClient.from("payments").insert({
        attendance_id: testAttendance.id,
        method: "stripe",
        amount: testEvent.fee,
        status: "paid",
        paid_at: newerTime.toISOString(),
        created_at: newerTime.toISOString(),
        updated_at: newerTime.toISOString(),
        stripe_payment_intent_id: "pi_test_newer_paid",
      });

      const sessionParams: CreateStripeSessionParams = {
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

      await expect(paymentService.createStripeSession(sessionParams)).rejects.toThrow(
        expect.objectContaining({
          type: PaymentErrorType.PAYMENT_ALREADY_EXISTS,
          message: "この参加に対する決済は既に完了済みです",
        })
      );
    });

    test("オープン決済が新しい場合の許可", async () => {
      const now = new Date();
      const olderTime = new Date(now.getTime() - 60000); // 1分前
      const newerTime = new Date(now.getTime() - 30000); // 30秒前

      // 古いpaid決済を作成
      await adminClient.from("payments").insert({
        attendance_id: testAttendance.id,
        method: "stripe",
        amount: testEvent.fee,
        status: "paid",
        paid_at: olderTime.toISOString(),
        created_at: olderTime.toISOString(),
        updated_at: olderTime.toISOString(),
        stripe_payment_intent_id: "pi_test_older_paid",
      });

      // 新しいpending決済を作成
      await adminClient.from("payments").insert({
        attendance_id: testAttendance.id,
        method: "stripe",
        amount: testEvent.fee,
        status: "pending",
        created_at: newerTime.toISOString(),
        updated_at: newerTime.toISOString(),
      });

      const sessionParams: CreateStripeSessionParams = {
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

      // エラーではなく成功することを期待
      const result = await paymentService.createStripeSession(sessionParams);
      expect(result.sessionUrl).toMatch(/^https:\/\/checkout\.stripe\.com/);
    });

    test("時間比較の優先順位 - 終端決済: paid_at > updated_at > created_at", async () => {
      const baseTime = new Date();
      const time1 = new Date(baseTime.getTime() - 90000); // 90秒前
      const time2 = new Date(baseTime.getTime() - 60000); // 60秒前
      const time3 = new Date(baseTime.getTime() - 30000); // 30秒前
      const time4 = new Date(baseTime.getTime() - 15000); // 15秒前（最新）

      // pending決済（比較対象）
      await adminClient.from("payments").insert({
        attendance_id: testAttendance.id,
        method: "stripe",
        amount: testEvent.fee,
        status: "pending",
        created_at: time2.toISOString(),
        updated_at: time2.toISOString(),
      });

      // 終端決済：created_at < updated_at < paid_at の順で設定
      // paid_atが最新なので、これが比較に使用されるべき
      await adminClient.from("payments").insert({
        attendance_id: testAttendance.id,
        method: "stripe",
        amount: testEvent.fee,
        status: "paid",
        created_at: time1.toISOString(), // 最も古い
        updated_at: time3.toISOString(), // 中間
        paid_at: time4.toISOString(), // 最新（これが使用される）
        stripe_payment_intent_id: "pi_test_time_priority",
      });

      const sessionParams: CreateStripeSessionParams = {
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

      // paid_at（time4）がpendingのupdated_at（time2）より新しいので拒否される
      await expect(paymentService.createStripeSession(sessionParams)).rejects.toThrow(
        expect.objectContaining({
          type: PaymentErrorType.PAYMENT_ALREADY_EXISTS,
          message: "この参加に対する決済は既に完了済みです",
        })
      );
    });

    test("時間比較の優先順位 - オープン決済: updated_at > created_at", async () => {
      const baseTime = new Date();
      const time1 = new Date(baseTime.getTime() - 60000); // 60秒前
      const time2 = new Date(baseTime.getTime() - 30000); // 30秒前
      const time3 = new Date(baseTime.getTime() - 45000); // 45秒前

      // 終端決済（比較対象）
      await adminClient.from("payments").insert({
        attendance_id: testAttendance.id,
        method: "stripe",
        amount: testEvent.fee,
        status: "paid",
        paid_at: time3.toISOString(), // 45秒前
        created_at: time1.toISOString(),
        updated_at: time1.toISOString(),
        stripe_payment_intent_id: "pi_test_open_time_priority",
      });

      // オープン決済：created_at < updated_at の順で設定
      // updated_atが最新なので、これが比較に使用されるべき
      await adminClient.from("payments").insert({
        attendance_id: testAttendance.id,
        method: "stripe",
        amount: testEvent.fee,
        status: "pending",
        created_at: time1.toISOString(), // 古い
        updated_at: time2.toISOString(), // 新しい（これが使用される）
      });

      const sessionParams: CreateStripeSessionParams = {
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

      // pendingのupdated_at（time2: 30秒前）が終端のpaid_at（time3: 45秒前）より新しいので許可される
      const result = await paymentService.createStripeSession(sessionParams);
      expect(result.sessionUrl).toMatch(/^https:\/\/checkout\.stripe\.com/);
    });
  });

  describe("並行処理・競合対策", () => {
    test("一意制約違反時の再試行メカニズム", async () => {
      // 並行作成をシミュレートするため、同じattendance_idでpending決済を複数作成試行
      // （実際の一意制約により2回目以降は制約違反になる）

      // 最初の決済を作成
      await adminClient.from("payments").insert({
        attendance_id: testAttendance.id,
        method: "stripe",
        amount: testEvent.fee,
        status: "pending",
      });

      const sessionParams: CreateStripeSessionParams = {
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

      // 2回目の呼び出しでも成功する（既存のpending決済を再利用）
      const result = await paymentService.createStripeSession(sessionParams);
      expect(result.sessionUrl).toMatch(/^https:\/\/checkout\.stripe\.com/);

      // 決済レコードは1つのままであることを確認
      const { data: payments } = await adminClient
        .from("payments")
        .select("*")
        .eq("attendance_id", testAttendance.id);

      expect(payments).toHaveLength(1);
      expect(payments[0].status).toBe("pending");
    });
  });

  describe("エラーハンドリング", () => {
    test("PaymentError.PAYMENT_ALREADY_EXISTS の詳細", async () => {
      // paid決済を作成
      await adminClient.from("payments").insert({
        attendance_id: testAttendance.id,
        method: "stripe",
        amount: testEvent.fee,
        status: "paid",
        paid_at: new Date().toISOString(),
        stripe_payment_intent_id: "pi_test_error_details",
      });

      const sessionParams: CreateStripeSessionParams = {
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

      try {
        await paymentService.createStripeSession(sessionParams);
        fail("PaymentError should be thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(PaymentError);
        expect(error.type).toBe(PaymentErrorType.PAYMENT_ALREADY_EXISTS);
        expect(error.message).toBe("この参加に対する決済は既に完了済みです");
        expect(error.name).toBe("PaymentError");
      }
    });
  });

  describe("ソート条件の検証", () => {
    test("終端決済のソート順序: paid_at DESC, created_at DESC", async () => {
      const baseTime = new Date();
      const time1 = new Date(baseTime.getTime() - 120000); // 2分前
      const time2 = new Date(baseTime.getTime() - 90000); // 1.5分前
      const time3 = new Date(baseTime.getTime() - 60000); // 1分前

      // 複数の終端決済を異なる時刻で作成
      // 最初に作成（古いpaid_at）
      await adminClient.from("payments").insert({
        attendance_id: testAttendance.id,
        method: "stripe",
        amount: testEvent.fee,
        status: "paid",
        paid_at: time1.toISOString(),
        created_at: time1.toISOString(),
        stripe_payment_intent_id: "pi_test_sort_1",
      });

      // 2番目に作成（新しいpaid_at）- これが取得される
      await adminClient.from("payments").insert({
        attendance_id: testAttendance.id,
        method: "stripe",
        amount: testEvent.fee,
        status: "paid",
        paid_at: time3.toISOString(), // 最新
        created_at: time2.toISOString(),
        stripe_payment_intent_id: "pi_test_sort_2",
      });

      const sessionParams: CreateStripeSessionParams = {
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

      // 最新のpaid_atを持つ決済が使用されるため拒否される
      await expect(paymentService.createStripeSession(sessionParams)).rejects.toThrow(
        expect.objectContaining({
          type: PaymentErrorType.PAYMENT_ALREADY_EXISTS,
        })
      );
    });

    test("オープン決済のソート順序: pending優先, updated_at DESC, created_at DESC", async () => {
      const baseTime = new Date();
      const time1 = new Date(baseTime.getTime() - 120000); // 2分前
      const time2 = new Date(baseTime.getTime() - 60000); // 1分前

      // failed決済（古い）
      await adminClient.from("payments").insert({
        attendance_id: testAttendance.id,
        method: "stripe",
        amount: testEvent.fee,
        status: "failed",
        created_at: time2.toISOString(),
        updated_at: time2.toISOString(),
      });

      // pending決済（古いが、failedより優先される）
      const { data: pendingPayment } = await adminClient
        .from("payments")
        .insert({
          attendance_id: testAttendance.id,
          method: "stripe",
          amount: testEvent.fee,
          status: "pending",
          created_at: time1.toISOString(), // failedより古い
          updated_at: time1.toISOString(),
        })
        .select()
        .single();

      const sessionParams: CreateStripeSessionParams = {
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

      // pending決済が優先的に再利用される
      const result = await paymentService.createStripeSession(sessionParams);
      expect(result.sessionUrl).toMatch(/^https:\/\/checkout\.stripe\.com/);

      // pendingが再利用され、failedは触れられていないことを確認
      const { data: payments } = await adminClient
        .from("payments")
        .select("*")
        .eq("attendance_id", testAttendance.id)
        .order("created_at", { ascending: false });

      expect(payments).toHaveLength(2);

      // pending決済のStripe識別子がリセットされていることを確認（再利用の証拠）
      const updatedPending = payments.find((p) => p.id === pendingPayment.id);
      expect(updatedPending.stripe_checkout_session_id).toBeNull();
      expect(updatedPending.stripe_payment_intent_id).toBeNull();

      // failed決済は変更されていない
      const failedPayment = payments.find((p) => p.status === "failed");
      expect(failedPayment).toBeDefined();
    });
  });
});
