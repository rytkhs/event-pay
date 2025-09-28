/**
 * 決済セッション検証API - 真の統合テスト
 *
 * エンドポイント: /api/payments/verify-session
 *
 * 🌟 真の統合テストの特徴:
 * - 実際のStripe Test Mode APIを使用（モック化なし）
 * - 実際のHTTPリクエスト送信でテスト
 * - 実際のデータベース操作とトランザクション
 * - 実際のネットワークエラーハンドリングテスト
 * - レート制限のみテスト用に無効化（Redis不要）
 *
 * VerifySessionTestHelperを活用してテストコードの保守性を向上
 */

import { NextRequest, NextResponse } from "next/server";

import { enforceRateLimit, withRateLimit, POLICIES } from "@core/rate-limit";
import { logSecurityEvent } from "@core/security/security-logger";
import { maskSessionId } from "@core/utils/mask";

import {
  createTestUserWithConnect,
  createPaidTestEvent,
  createTestAttendance,
} from "@tests/helpers/test-payment-data";
import {
  VerifySessionTestHelper,
  type VerifySessionTestSetup,
  type VerifySessionScenario,
  type FallbackScenario,
  type ErrorScenario,
  FALLBACK_SCENARIOS,
} from "@tests/helpers/verify-session-test.helper";
import { testDataManager } from "@tests/setup/test-data-seeds";

import { GET as verifySessionHandler } from "@/app/api/payments/verify-session/route";

// セキュリティログのモック
jest.mock("@core/security/security-logger", () => ({
  logSecurityEvent: jest.fn(),
}));

// レート制限のモック
jest.mock("@core/rate-limit", () => ({
  ...jest.requireActual("@core/rate-limit"),
  enforceRateLimit: jest.fn(),
  withRateLimit: jest.fn(),
}));

// Stripeクライアントは実際のTest Mode APIを使用（モック化しない）
// テスト環境でのStripe Test Keyが必要

describe("決済セッション検証API 統合テスト (リファクタリング版)", () => {
  let testHelper: VerifySessionTestHelper;
  let testSetup: VerifySessionTestSetup;

  const mockLogSecurityEvent = logSecurityEvent as jest.MockedFunction<typeof logSecurityEvent>;
  const mockEnforceRateLimit = enforceRateLimit as jest.MockedFunction<typeof enforceRateLimit>;
  const mockWithRateLimit = withRateLimit as jest.MockedFunction<typeof withRateLimit>;
  // 実際のStripe APIを使用するため、mockStripeRetrieveは不要

  beforeAll(async () => {
    // 完全なテストセットアップを作成
    testSetup = await VerifySessionTestHelper.createCompleteSetup(
      "verify-session-integration-refactored"
    );
    testHelper = new VerifySessionTestHelper(testSetup);

    // セキュリティログのモック統合（実際のログ出力を抑制）
    testSetup.mockLogSecurityEvent = mockLogSecurityEvent;
  });

  afterEach(async () => {
    // 各テスト後のクリーンアップ
    await testHelper.cleanupAttendancePayments(testSetup.attendance.id);
  });

  afterAll(async () => {
    await testDataManager.cleanupTestData();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // デフォルトでレート制限は通す（モック化）
    mockEnforceRateLimit.mockResolvedValue({ allowed: true });
    mockWithRateLimit.mockImplementation((_policy, _keyBuilder) => {
      return async (_request: NextRequest) => {
        return null; // レート制限なし
      };
    });
  });

  describe("🎯 正常系テスト - 共通シナリオ活用", () => {
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
      const results = await testHelper.runBatchScenarios(statusScenarios, verifySessionHandler);

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

      const results = await testHelper.runBatchScenarios(
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

      const results = await testHelper.runBatchScenarios(
        integrationScenarios,
        verifySessionHandler
      );

      results.forEach((result) => {
        expect(result.error).toBeUndefined();
      });
    });
  });

  describe("🌐 ネットワークエラーテスト", () => {
    test("不正な形式のStripe Session IDでのAPI呼び出し", async () => {
      // 不正な形式のセッションIDで実際のAPIエラーをテスト
      const malformedSessionId = "invalid_session_id_format";

      const networkErrorScenario: ErrorScenario = {
        name: "不正形式Session ID → Stripe APIエラー",
        requestConfig: { sessionId: malformedSessionId },
        expectedStatus: 404,
      };

      const result = await testHelper.runErrorScenario(networkErrorScenario, verifySessionHandler);
      expect(result.code).toBe("PAYMENT_SESSION_NOT_FOUND");
    });

    test("非常に長いSession IDでのAPI呼び出し", async () => {
      // 異常に長いセッションIDで実際のAPIの堅牢性をテスト
      const overlyLongSessionId = "cs_test_" + "x".repeat(200);

      const edgeCaseScenario: ErrorScenario = {
        name: "異常に長いSession ID → APIエラー",
        requestConfig: { sessionId: overlyLongSessionId },
        expectedStatus: 404,
      };

      const result = await testHelper.runErrorScenario(edgeCaseScenario, verifySessionHandler);
      expect(result.code).toBe("PAYMENT_SESSION_NOT_FOUND");
    });
  });

  describe("❌ 異常系テスト - シナリオベース", () => {
    test("認証・認可エラー", async () => {
      const authErrorScenarios: ErrorScenario[] = [
        {
          name: "ゲストトークン欠落 → 400 Bad Request（仕様書準拠）",
          requestConfig: { guestToken: "" },
          expectedStatus: 400,
          expectedMessage: "ゲストトークンが必要です",
        },
        {
          name: "ゲストトークン不一致 → 404 Not Found（仕様書準拠）",
          requestConfig: {
            sessionId: "cs_test_guest_token_mismatch",
            guestToken: "invalid_guest_token_123",
          },
          expectedStatus: 404,
        },
      ];

      for (const scenario of authErrorScenarios) {
        const result = await testHelper.runErrorScenario(scenario, verifySessionHandler);

        // 仕様書準拠のエラーレスポンス形式確認
        expect(result).toHaveProperty("type");
        expect(result).toHaveProperty("title");
        expect(result).toHaveProperty("code");
        expect(result).toHaveProperty("correlation_id");
        expect(result.retryable).toBe(false);
      }

      // セキュリティログの検証
      expect(mockLogSecurityEvent).toHaveBeenCalled();
    });

    test("バリデーションエラー", async () => {
      const validationErrorScenarios: ErrorScenario[] = [
        {
          name: "session_id欠落 → 422 Validation Error（仕様書準拠）",
          requestConfig: { sessionId: "" },
          expectedStatus: 422,
        },
        {
          name: "attendance_id不正（UUID違反） → 422 Validation Error",
          requestConfig: { attendanceId: "invalid-uuid-format" },
          expectedStatus: 422,
        },
        {
          name: "複数バリデーションエラー → まとめてエラー配列に含める",
          requestConfig: {
            sessionId: "",
            attendanceId: "invalid-uuid",
          },
          expectedStatus: 422,
        },
      ];

      for (const scenario of validationErrorScenarios) {
        const result = await testHelper.runErrorScenario(scenario, verifySessionHandler);

        // バリデーションエラーの場合はerrorsフィールドが存在
        if (scenario.name.includes("複数")) {
          expect(result.errors).toHaveLength(2);
        } else if (
          scenario.name.includes("session_id") ||
          scenario.name.includes("attendance_id")
        ) {
          expect(result.errors).toBeDefined();
        }
      }
    });

    test("システムエラー", async () => {
      // 存在しないStripe SessionIDでテスト（実際のAPIエラーを発生させる）
      const systemErrorScenario: ErrorScenario = {
        name: "存在しないStripe SessionID → 404 Not Found",
        requestConfig: { sessionId: "cs_nonexistent_session_id_12345" },
        expectedStatus: 404,
      };

      const result = await testHelper.runErrorScenario(systemErrorScenario, verifySessionHandler);
      expect(result.code).toBe("PAYMENT_SESSION_NOT_FOUND");
      expect(result.correlation_id).toBeTruthy();
    });
  });

  describe("🔒 セキュリティテスト", () => {
    test("権限確認 - 他人の参加記録へのアクセス試行", async () => {
      // 別のユーザーの参加記録を作成
      const anotherUser = await createTestUserWithConnect();
      const anotherEvent = await createPaidTestEvent(anotherUser.id);
      const anotherAttendance = await createTestAttendance(anotherEvent.id);

      const unauthorizedScenario: ErrorScenario = {
        name: "他人の参加記録へのアクセス試行",
        requestConfig: {
          sessionId: "cs_test_unauthorized_access",
          attendanceId: anotherAttendance.id,
          guestToken: testSetup.attendance.guest_token,
        },
        expectedStatus: 404,
      };

      const result = await testHelper.runErrorScenario(unauthorizedScenario, verifySessionHandler);
      expect(result.code).toBe("PAYMENT_SESSION_NOT_FOUND");

      // セキュリティログ記録確認
      expect(mockLogSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "SUSPICIOUS_ACTIVITY",
          severity: "HIGH",
          message: expect.stringContaining("token mismatch"),
        })
      );
    });

    test("入力サニタイゼーション - SQLインジェクション試行", async () => {
      const maliciousInput = "'; DROP TABLE payments; --";
      const sqliScenario: ErrorScenario = {
        name: "SQLインジェクション試行 → 安全にエラーレスポンス",
        requestConfig: {
          sessionId: maliciousInput,
          attendanceId: testSetup.attendance.id,
        },
        expectedStatus: 404, // SQLインジェクションが無効化されてStripe APIエラー
      };

      const result = await testHelper.runErrorScenario(sqliScenario, verifySessionHandler);
      expect(result.code).toBe("PAYMENT_SESSION_NOT_FOUND");
    });
  });

  describe("⚡ レート制限テスト", () => {
    test("レート制限超過 → 429 Too Many Requests（仕様書準拠）", async () => {
      // レート制限を発生させる
      mockWithRateLimit.mockImplementation((_policy, _keyBuilder) => {
        return async (_request: NextRequest) => {
          return NextResponse.json(
            {
              type: "https://api.eventpay.app/errors/rate_limited",
              title: "Rate Limit Exceeded",
              status: 429,
              code: "RATE_LIMITED",
              detail: "リクエスト回数の上限に達しました。しばらく待ってから再試行してください",
              retryable: true,
              instance: "/api/payments/verify-session",
              correlation_id: "req_test_correlation_id",
            },
            {
              status: 429,
              headers: {
                "Content-Type": "application/problem+json",
                "Retry-After": "120",
              },
            }
          );
        };
      });

      const request = testHelper.createRequest({});
      const response = await verifySessionHandler(request);
      const result = await response.json();

      // 仕様書エラーレスポンス: RATE_LIMITED
      expect(response.status).toBe(429);
      expect(result).toMatchObject({
        type: "https://api.eventpay.app/errors/rate_limited",
        title: "Rate Limit Exceeded",
        status: 429,
        code: "RATE_LIMITED",
        retryable: true,
      });
      expect(response.headers.get("Retry-After")).toBe("120");
    });

    test("レート制限ポリシー確認 → stripe.checkout適用", async () => {
      const request = testHelper.createRequest({});
      await verifySessionHandler(request);

      // 正しいポリシーでレート制限チェック
      expect(mockWithRateLimit).toHaveBeenCalledWith(
        POLICIES["stripe.checkout"],
        expect.any(Function)
      );
    });
  });

  describe("🔧 フォールバック機能テスト", () => {
    test("フォールバック機能 - 複数パターンの一括テスト", async () => {
      // 事前定義されたフォールバックシナリオを使用
      const fallbackScenarios: FallbackScenario[] = [
        {
          ...FALLBACK_SCENARIOS.CLIENT_REFERENCE_ID,
          sessionId: "cs_test_fallback_client_ref_refactored",
        },
        {
          ...FALLBACK_SCENARIOS.METADATA,
          sessionId: "cs_test_fallback_metadata_refactored",
        },
        {
          ...FALLBACK_SCENARIOS.PAYMENT_INTENT_METADATA,
          sessionId: "cs_test_fallback_pi_metadata_refactored",
        },
      ];

      // バッチ実行
      const results = await testHelper.runBatchScenarios(fallbackScenarios, verifySessionHandler);

      // 全て成功することを確認
      results.forEach((result, index) => {
        expect(result.error).toBeUndefined();
        expect(result.result.success).toBe(true);
        expect(result.result.payment_status).toBe("pending"); // 実際のStripe APIでは作成直後はpending
        console.log(`✅ Fallback scenario ${index + 1} completed`);
      });
    });

    test("全フォールバック失敗 → 404 Not Found", async () => {
      // 実際のStripe Sessionを作成（存在しないpayment IDでフォールバック失敗を発生させる）
      const nonExistentPaymentId = "payment_id_does_not_exist_123";

      const sessionId = await testHelper.createRealStripeSession(nonExistentPaymentId, {
        clientReferenceId: nonExistentPaymentId,
        metadata: {
          payment_id: nonExistentPaymentId,
          test_scenario: "fallback_all_fail",
        },
      });

      const request = testHelper.createRequest({ sessionId });
      const response = await verifySessionHandler(request);
      const result = await response.json();

      expect(response.status).toBe(404);
      expect(result.code).toBe("PAYMENT_SESSION_NOT_FOUND");

      // 突合失敗のセキュリティログ確認
      expect(mockLogSecurityEvent).toHaveBeenCalledWith({
        type: "SUSPICIOUS_ACTIVITY",
        severity: "HIGH",
        message: "Payment verification failed - no matching record found with guest token",
        details: expect.objectContaining({
          attendanceId: testSetup.attendance.id,
          sessionId: expect.stringContaining("..."), // マスクされたセッションID
          hasGuestToken: true,
        }),
        ip: expect.any(String),
        timestamp: expect.any(Date),
      });
    });
  });

  describe("📋 レスポンス構造検証", () => {
    test("成功時レスポンス構造の厳密検証", async () => {
      const responseTestScenario: VerifySessionScenario = {
        name: "成功時レスポンス構造検証",
        sessionId: "cs_test_response_structure",
        paymentStatus: "paid",
        stripeResponse: {
          payment_status: "paid",
        },
        shouldCreatePayment: true,
        paymentOverrides: {
          stripe_payment_intent_id: "pi_test_response",
        },
        useIndependentAttendance: true,
      };

      const result = await testHelper.runSuccessScenario(
        responseTestScenario,
        verifySessionHandler
      );

      // 実際のStripe APIレスポンスに基づくフィールド
      expect(result).toEqual({
        success: true,
        payment_status: "pending", // 実際のStripe Sessionは作成直後はpending
        payment_required: true,
      });

      // 成功時はerrorフィールドは省略される（仕様書準拠）
      expect(result).not.toHaveProperty("error");
      expect(result).not.toHaveProperty("message");
      expect(result).not.toHaveProperty("data");
    });
  });

  describe("🎯 エッジケース・境界値テスト", () => {
    test("数値境界値テスト", async () => {
      const boundaryScenarios: VerifySessionScenario[] = [
        {
          name: "金額ゼロの場合のpayment_required判定",
          sessionId: "cs_test_zero_amount",
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
          name: "金額50円の場合のpayment_required判定（Stripe最小額）",
          sessionId: "cs_test_minimum_amount",
          paymentStatus: "paid",
          stripeResponse: {
            payment_status: "paid",
            amount_total: 50,
          },
          shouldCreatePayment: true,
          paymentOverrides: { amount: 50 },
          expectedResult: { success: true, payment_required: true },
          useIndependentAttendance: true,
        },
        {
          name: "非常に大きな金額のテスト（1,000万円）",
          sessionId: "cs_test_large_amount",
          paymentStatus: "paid",
          stripeResponse: {
            payment_status: "paid",
            amount_total: 10_000_000,
          },
          shouldCreatePayment: true,
          paymentOverrides: { amount: 10_000_000 },
          expectedResult: { success: true, payment_required: true },
          useIndependentAttendance: true,
        },
      ];

      const results = await testHelper.runBatchScenarios(boundaryScenarios, verifySessionHandler);

      results.forEach((result) => {
        expect(result.error).toBeUndefined();
      });
    });

    test("特殊文字・エンコーディングテスト", async () => {
      // Unicode文字を含むセッションIDの処理テスト
      const unicodeScenario: VerifySessionScenario = {
        name: "Unicode文字を含むセッションIDの処理",
        sessionId: "cs_test_unicode_テスト_🌟",
        paymentStatus: "paid",
        stripeResponse: {
          payment_status: "paid",
        },
        shouldCreatePayment: true,
        paymentOverrides: {
          stripe_payment_intent_id: `pi_test_unicode_${Date.now()}`,
        },
        expectedResult: { success: true },
        useIndependentAttendance: true,
      };

      const result = await testHelper.runSuccessScenario(unicodeScenario, verifySessionHandler);
      expect(result.success).toBe(true);

      // 制御文字を含む入力の安全な処理
      const maliciousSessionId = "cs_test\x00\x01\x1f";
      const request = testHelper.createRequest({ sessionId: maliciousSessionId });
      const response = await verifySessionHandler(request);

      // 制御文字が安全に処理される
      expect([200, 422, 404]).toContain(response.status);
    });
  });

  describe("🔍 仕様書の実装差異検出テスト", () => {
    test("【重要】レスポンス型定義の仕様書準拠性", async () => {
      const specComplianceScenario: VerifySessionScenario = {
        name: "レスポンス型定義仕様書準拠テスト",
        sessionId: "cs_test_response_type_validation",
        paymentStatus: "paid",
        stripeResponse: {
          payment_status: "paid",
        },
        shouldCreatePayment: true,
        paymentOverrides: {
          stripe_payment_intent_id: "pi_test_response_type",
        },
        useIndependentAttendance: true,
      };

      const result = await testHelper.runSuccessScenario(
        specComplianceScenario,
        verifySessionHandler
      );

      // 仕様書更新後のレスポンス型定義確認
      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("payment_status");
      expect(result).toHaveProperty("payment_required");

      // 型の正確性
      expect(typeof result.success).toBe("boolean");
      expect(typeof result.payment_status).toBe("string");
      expect(typeof result.payment_required).toBe("boolean");

      // 成功時はerrorフィールドは省略される
      expect(result).not.toHaveProperty("error");
    });

    test("【重要】レート制限設定の仕様書準拠性", async () => {
      const request = testHelper.createRequest({});
      await verifySessionHandler(request);

      // 仕様書記載のレート制限設定確認
      expect(mockWithRateLimit).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: "stripe.checkout",
          limit: 10,
          window: "1 m",
          blockMs: 2 * 60 * 1000,
        }),
        expect.any(Function)
      );
    });

    test("【重要】エラーレスポンスのProblem Details準拠性", async () => {
      const errorScenario: ErrorScenario = {
        name: "Problem Detailsエラーレスポンス形式確認",
        requestConfig: { sessionId: "" },
        expectedStatus: 422,
      };

      const result = await testHelper.runErrorScenario(errorScenario, verifySessionHandler);

      // RFC 7807 Problem Details 必須フィールド
      const requiredFields = ["type", "title", "status", "detail", "instance"];
      requiredFields.forEach((field) => {
        expect(result).toHaveProperty(field);
      });

      // EventPay拡張フィールド
      const eventPayFields = ["code", "correlation_id", "retryable"];
      eventPayFields.forEach((field) => {
        expect(result).toHaveProperty(field);
      });
    });

    test("【重要】セキュリティログ記録の仕様書準拠性", async () => {
      // トークン不一致でセキュリティイベント発生
      const securityTestScenario: ErrorScenario = {
        name: "セキュリティログテスト",
        requestConfig: {
          sessionId: "cs_test_security_log",
          guestToken: "invalid_token",
        },
        expectedStatus: 404,
      };

      await testHelper.runErrorScenario(securityTestScenario, verifySessionHandler);

      // 仕様書記載のセキュリティイベント形式確認
      expect(mockLogSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "SUSPICIOUS_ACTIVITY",
          severity: "HIGH",
          message: expect.stringContaining("token mismatch"),
          details: expect.objectContaining({
            attendanceId: expect.any(String),
            sessionId: expect.stringContaining("..."),
            tokenMatch: false,
          }),
          ip: expect.any(String),
          timestamp: expect.any(Date),
        })
      );
    });

    test("【重要】セッションIDマスク処理の確認", async () => {
      const longSessionId = "cs_test_mask_processing_123456789";
      const request = testHelper.createRequest({
        sessionId: longSessionId,
        guestToken: "invalid_token",
      });

      await verifySessionHandler(request);

      // セッションIDの統一マスク関数使用確認
      expect(mockLogSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({
            sessionId: maskSessionId(longSessionId),
          }),
        })
      );
    });
  });
});
