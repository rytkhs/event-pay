/**
 * Verify Session API: 正常系テスト
 */

import { describe, test, expect, beforeAll, afterAll, afterEach, beforeEach } from "@jest/globals";

// モックは他のインポートより前に宣言する必要がある
jest.mock("@core/security/security-logger");
jest.mock("@core/rate-limit");

import type { VerifySessionScenario } from "@tests/helpers/test-verify-session";

import { GET as verifySessionHandler } from "@/app/api/payments/verify-session/route";

import {
  setupVerifySessionTest,
  setupBeforeEach,
  cleanupAfterEach,
  cleanupAfterAll,
  type VerifySessionTestContext,
} from "./verify-session-test-setup";

describe("🎯 正常系テスト - 共通シナリオ活用", () => {
  let context: VerifySessionTestContext;

  beforeAll(async () => {
    context = await setupVerifySessionTest();
  });

  afterAll(async () => {
    await cleanupAfterAll(context);
  });

  beforeEach(() => {
    setupBeforeEach(context);
  });

  afterEach(async () => {
    await cleanupAfterEach(context);
  });

  test("決済ステータス判定ロジック - バッチテスト実行", async () => {
    // 決済ステータス判定の複数シナリオを一括実行
    const statusScenarios: VerifySessionScenario[] = [
      {
        name: "実際のStripe Session作成直後 → API response='pending'",
        sessionId: "cs_test_real_stripe_session",
        paymentStatus: "pending", // DB状態も実際に合わせる
        shouldCreatePayment: true,
        paymentOverrides: {
          stripe_payment_intent_id: "pi_test_real_123",
        },
        expectedResult: {
          success: true,
          payment_status: "pending", // 実際のStripe APIの作成直後状態
          payment_required: true,
        },
        useIndependentAttendance: true,
      },
      {
        name: "実際のStripe payment_status='unpaid' + status='open' → API response='pending'",
        sessionId: "cs_test_unpaid_open_status",
        paymentStatus: "pending",
        shouldCreatePayment: true,
        expectedResult: {
          success: true,
          payment_status: "pending", // 実際のStripe APIでは作成直後は pending
          payment_required: true,
        },
        useIndependentAttendance: true,
      },
      {
        name: "Stripe payment_status='unpaid' + その他status → API response='pending'",
        sessionId: "cs_test_unpaid_status",
        paymentStatus: "pending",
        stripeResponse: {
          payment_status: "unpaid",
          status: "open",
        },
        shouldCreatePayment: true,
        expectedResult: {
          success: true,
          payment_status: "pending",
          payment_required: true,
        },
        useIndependentAttendance: true,
      },
      {
        name: "無料イベント（amount=0）でも実際はpending → API response='pending'",
        sessionId: "cs_test_free_event_real_behavior",
        paymentStatus: "paid",
        shouldCreatePayment: true,
        paymentOverrides: {
          amount: 0,
        },
        stripeResponse: { amount_total: 0 }, // 無料セッション作成
        expectedResult: {
          success: true,
          payment_status: "pending", // 実際のStripe APIでは作成直後はpending
          payment_required: false,
        },
        useIndependentAttendance: true,
      },
      {
        name: "実際のStripe無料セッション → API response='pending'",
        sessionId: "cs_test_free_stripe_session",
        paymentStatus: "paid",
        shouldCreatePayment: true,
        paymentOverrides: { amount: 0 },
        stripeResponse: { amount_total: 0 }, // 無料セッション作成
        expectedResult: {
          success: true,
          payment_status: "pending", // 実際のAPIでは作成直後は未完了
          payment_required: false, // ただし支払い不要
        },
        useIndependentAttendance: true,
      },
      {
        name: "実際のStripe通常セッション → API response='pending'",
        sessionId: "cs_test_normal_unpaid",
        paymentStatus: "pending",
        shouldCreatePayment: true,
        expectedResult: {
          success: true,
          payment_status: "pending", // 実際のStripe APIでは作成直後はpending
          payment_required: true,
        },
        useIndependentAttendance: true,
      },
    ];

    // バッチテスト実行
    const results = await context.testHelper.runBatchScenarios(
      statusScenarios,
      verifySessionHandler
    );

    // 全てのシナリオが成功したことを確認
    results.forEach((result, index) => {
      expect(result.error).toBeUndefined();
      expect(result.result).toBeDefined();
      console.log(`✅ Scenario ${index + 1} completed: ${statusScenarios[index].name}`);
    });
  });

  test("payment_required フラグ判定", async () => {
    const paymentRequiredScenarios: VerifySessionScenario[] = [
      {
        name: "無料イベント（amount=0）→ payment_required=false",
        sessionId: "cs_test_free_event",
        paymentStatus: "paid",
        stripeResponse: {
          payment_status: "no_payment_required",
          amount_total: 0,
        },
        shouldCreatePayment: true,
        paymentOverrides: { amount: 0 },
        expectedResult: { success: true, payment_required: false },
        useIndependentAttendance: true,
      },
      {
        name: "全額割引（Stripe amount_total=0）→ payment_required=false",
        sessionId: "cs_test_full_discount",
        paymentStatus: "paid",
        stripeResponse: {
          payment_status: "paid",
          amount_total: 0,
        },
        shouldCreatePayment: true,
        paymentOverrides: { amount: 1000 },
        expectedResult: { success: true, payment_required: false },
        useIndependentAttendance: true,
      },
      {
        name: "有料イベント → payment_required=true",
        sessionId: "cs_test_paid_event",
        paymentStatus: "paid",
        stripeResponse: {
          payment_status: "paid",
          amount_total: 1000,
        },
        shouldCreatePayment: true,
        paymentOverrides: { amount: 1000 },
        expectedResult: { success: true, payment_required: true },
        useIndependentAttendance: true,
      },
    ];

    const results = await context.testHelper.runBatchScenarios(
      paymentRequiredScenarios,
      verifySessionHandler
    );

    // 結果検証
    results.forEach((result) => {
      expect(result.error).toBeUndefined();
    });
  });

  test("DB・Stripe整合性チェック", async () => {
    const integrationScenarios: VerifySessionScenario[] = [
      {
        name: "実際のStripe='unpaid' + DB='pending' → API response='pending'（実API準拠）",
        sessionId: "cs_test_integrity_check",
        paymentStatus: "pending",
        shouldCreatePayment: true,
        expectedResult: {
          success: true,
          payment_status: "pending", // 実際のStripe APIの動作に合わせる
          payment_required: true,
        },
        useIndependentAttendance: true,
      },
      {
        name: "実際のStripe='unpaid' + DB='paid' → 状態不整合の検出",
        sessionId: "cs_test_integrity_mismatch",
        paymentStatus: "paid", // DBは完了状態
        shouldCreatePayment: true,
        expectedResult: {
          success: true,
          payment_status: "pending", // Stripeが未完了なので実際の状態を返す
          payment_required: true,
        },
        useIndependentAttendance: true,
      },
    ];

    const results = await context.testHelper.runBatchScenarios(
      integrationScenarios,
      verifySessionHandler
    );

    results.forEach((result) => {
      expect(result.error).toBeUndefined();
    });
  });
});
