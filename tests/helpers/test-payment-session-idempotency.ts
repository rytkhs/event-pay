/**
 * 決済セッション作成冪等性テスト専用ヘルパー
 *
 * 目的：
 * PaymentService.createStripeSession の冪等性・並行制御を厳密に検証するための
 * 統合テスト用ヘルパー関数を提供
 *
 * テスト観点：
 * 1. 基本冪等性: 同一パラメータでの重複実行
 * 2. 並行制御: 複数スレッドでの同時実行
 * 3. 金額変更: Idempotency Key回転の確認
 * 4. 制約違反回復: DB制約違反からの自動回復
 * 5. Terminal状態ガード: 完了済み決済での拒否
 * 6. ステータス遷移: failed→pendingの新規作成
 */

import { jest } from "@jest/globals";

import { getPaymentPort, type PaymentPort } from "@core/ports/payments";
import { PaymentError, PaymentErrorType } from "@core/types/payment-errors";

import { CreateStripeSessionParams, CreateStripeSessionResult } from "@features/payments";

import { createPaymentTestSetup } from "@tests/setup/common-test-setup";

import type { Database } from "@/types/database";

import {
  cleanupTestPaymentData,
  type TestPaymentUser,
  type TestPaymentEvent,
  type TestAttendanceData,
} from "./test-payment-data";

type PaymentStatus = Database["public"]["Enums"]["payment_status_enum"];

export interface IdempotencyTestSetup {
  user: TestPaymentUser;
  event: TestPaymentEvent;
  attendance: TestAttendanceData;
  paymentPort: PaymentPort;
  adminClient: any;
  createSessionParams: CreateStripeSessionParams;
  cleanup: () => Promise<void>;
}

export interface ConcurrentTestResult {
  results: CreateStripeSessionResult[];
  errors: Error[];
  timings: number[];
  uniqueSessionIds: string[];
  paymentRecords: any[];
}

export interface IdempotencyKeyTestResult {
  initialResult: CreateStripeSessionResult;
  repeatedResult: CreateStripeSessionResult;
  keyRotated: boolean;
  initialKey: string | null;
  repeatedKey: string | null;
  keyRevision: number;
}

/**
 * 決済セッション冪等性テストヘルパー
 */
export class PaymentSessionIdempotencyTestHelper {
  private setup: IdempotencyTestSetup;

  constructor(setup: IdempotencyTestSetup) {
    this.setup = setup;
  }

  /**
   * 完全なテストセットアップを作成
   */
  static async createCompleteSetup(
    scenarioName: string = "idempotency-test"
  ): Promise<IdempotencyTestSetup> {
    // eslint-disable-next-line no-console
    console.log(`🚀 決済セッション冪等性テストセットアップ開始: ${scenarioName}`);

    // 共通決済テストセットアップを使用
    const paymentSetup = await createPaymentTestSetup({
      testName: scenarioName,
      eventFee: 1000,
      paymentMethods: ["stripe"],
      accessedTables: ["public.payments", "public.attendances", "public.events"],
    });

    const paymentPort = getPaymentPort();

    const user = paymentSetup.testUser;
    const event = paymentSetup.testEvent;
    const attendance = paymentSetup.testAttendance;
    const adminClient = paymentSetup.adminClient;

    // 共通の createStripeSession パラメータを作成
    const createSessionParams: CreateStripeSessionParams = {
      attendanceId: attendance.id,
      amount: event.fee,
      eventId: event.id,
      payoutProfileId: event.payout_profile_id ?? user.payoutProfileId ?? "",
      actorId: attendance.id,
      eventTitle: event.title,
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
      destinationCharges: {
        destinationAccountId: user.stripeConnectAccountId || "acct_default_test",
        userEmail: attendance.email,
        userName: attendance.nickname,
      },
    };

    // eslint-disable-next-line no-console
    console.log(`✅ 冪等性テストセットアップ完了: ${scenarioName}`);

    return {
      user,
      event,
      attendance,
      paymentPort,
      adminClient,
      createSessionParams,
      cleanup: paymentSetup.cleanup,
    };
  }

  /**
   * 既存決済データをクリーンアップ
   */
  async cleanupPaymentData(): Promise<void> {
    await this.setup.adminClient
      .from("payments")
      .delete()
      .eq("attendance_id", this.setup.attendance.id);
  }

  /**
   * 包括的なテストデータクリーンアップ
   * テスト間でのデータ残存問題を解決
   */
  async cleanupAllTestData(): Promise<void> {
    try {
      // 1. 該当参加のすべての決済を削除
      const { error: paymentsError } = await this.setup.adminClient
        .from("payments")
        .delete()
        .eq("attendance_id", this.setup.attendance.id);

      if (paymentsError) {
        console.warn(`⚠️ Payment cleanup warning: ${paymentsError.message}`);
      }

      // 2. 関連するテストデータの削除（必要に応じて）
      // 注：参加者データやイベントデータは他のテストで共用される可能性があるため、
      // ここでは決済データのみクリーンアップ

      // 3. クリーンアップ完了の確認
      const { data: remainingPayments } = await this.setup.adminClient
        .from("payments")
        .select("id")
        .eq("attendance_id", this.setup.attendance.id);

      if (remainingPayments && remainingPayments.length > 0) {
        console.warn(`⚠️ ${remainingPayments.length} payments still remain after cleanup`);
      }
    } catch (error) {
      console.error("❌ Test data cleanup failed:", error);
      // クリーンアップ失敗してもテストは継続（最善努力）
    }
  }

  /**
   * 現在の決済レコード状態を取得
   */
  async getCurrentPaymentState(): Promise<{
    payments: any[];
    pendingCount: number;
    terminalCount: number;
    latestPayment: any | null;
  }> {
    const { data: payments } = await this.setup.adminClient
      .from("payments")
      .select("*")
      .eq("attendance_id", this.setup.attendance.id)
      .order("created_at", { ascending: false });

    const pendingCount =
      payments?.filter((p: any) => ["pending", "failed"].includes(p.status)).length || 0;
    const terminalCount =
      payments?.filter((p: any) => ["paid", "received", "refunded", "waived"].includes(p.status))
        .length || 0;

    return {
      payments: payments || [],
      pendingCount,
      terminalCount,
      latestPayment: payments?.[0] || null,
    };
  }

  /**
   * 指定されたステータスの決済を作成
   */
  async createPaymentWithStatus(
    status: PaymentStatus,
    options: {
      amount?: number;
      method?: Database["public"]["Enums"]["payment_method_enum"];
      stripePaymentIntentId?: string;
      paidAt?: Date;
      checkoutIdempotencyKey?: string;
      checkoutKeyRevision?: number;
    } = {}
  ): Promise<string> {
    const {
      amount = this.setup.event.fee,
      method = status === "received" ? "cash" : "stripe",
      stripePaymentIntentId = ["pending", "received"].includes(status)
        ? null
        : `pi_test_${status}_${Date.now()}`,
      paidAt = ["paid", "received", "refunded", "waived"].includes(status) ? new Date() : null,
      checkoutIdempotencyKey = null,
      checkoutKeyRevision = 0,
    } = options;

    const { data: payment, error } = await this.setup.adminClient
      .from("payments")
      .insert({
        attendance_id: this.setup.attendance.id,
        method,
        amount,
        status,
        stripe_payment_intent_id: stripePaymentIntentId,
        paid_at: paidAt?.toISOString() || null,
        checkout_idempotency_key: checkoutIdempotencyKey,
        checkout_key_revision: checkoutKeyRevision,
        application_fee_amount: method === "stripe" ? Math.floor(amount * 0.1) : 0,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create payment with status ${status}: ${error.message}`);
    }

    return payment.id;
  }

  /**
   * 同じパラメータで複数回セッション作成を実行（基本冪等性テスト）
   */
  async testBasicIdempotency(repetitions: number = 3): Promise<{
    results: CreateStripeSessionResult[];
    allSessionIdsMatch: boolean;
    finalPaymentCount: number;
    executionTimes: number[];
  }> {
    const results: CreateStripeSessionResult[] = [];
    const executionTimes: number[] = [];

    for (let i = 0; i < repetitions; i++) {
      const startTime = Date.now();
      const result = await this.setup.paymentPort.createStripeSession(
        this.setup.createSessionParams
      );
      const executionTime = Date.now() - startTime;

      results.push(result);
      executionTimes.push(executionTime);
    }

    // すべてのセッションIDが同じかチェック
    const uniqueSessionIds = [...new Set(results.map((r) => r.sessionId))];
    const allSessionIdsMatch = uniqueSessionIds.length === 1;

    // 最終的な決済レコード数を確認
    const { payments } = await this.getCurrentPaymentState();
    const finalPaymentCount = payments.length;

    return {
      results,
      allSessionIdsMatch,
      finalPaymentCount,
      executionTimes,
    };
  }

  /**
   * 金額変更時のIdempotency Key回転をテスト
   */
  async testIdempotencyKeyRotation(
    initialAmount: number = 1000,
    changedAmount: number = 1500
  ): Promise<IdempotencyKeyTestResult> {
    // 1. 初回実行
    const initialParams = { ...this.setup.createSessionParams, amount: initialAmount };
    const initialResult = await this.setup.paymentPort.createStripeSession(initialParams);

    // 初回実行後のIdempotency Key情報を取得
    const { latestPayment: initialPayment } = await this.getCurrentPaymentState();
    const initialKey = initialPayment?.checkout_idempotency_key || null;

    // 2. 金額変更して再実行
    const changedParams = { ...this.setup.createSessionParams, amount: changedAmount };
    const repeatedResult = await this.setup.paymentPort.createStripeSession(changedParams);

    // 変更後のIdempotency Key情報を取得
    const { latestPayment: changedPayment } = await this.getCurrentPaymentState();
    const repeatedKey = changedPayment?.checkout_idempotency_key || null;
    const keyRevision = changedPayment?.checkout_key_revision || 0;

    const keyRotated = initialKey !== repeatedKey && repeatedKey !== null;

    return {
      initialResult,
      repeatedResult,
      keyRotated,
      initialKey,
      repeatedKey,
      keyRevision,
    };
  }

  /**
   * 並行実行をシミュレート（Promise.all使用）
   */
  async testConcurrentExecution(
    concurrency: number = 3,
    useVariedParams: boolean = false
  ): Promise<ConcurrentTestResult> {
    const promises: Promise<CreateStripeSessionResult | Error>[] = [];
    const startTime = Date.now();

    // 並行でセッション作成を実行
    for (let i = 0; i < concurrency; i++) {
      const params = useVariedParams
        ? { ...this.setup.createSessionParams, amount: this.setup.createSessionParams.amount + i }
        : this.setup.createSessionParams;

      const promise = this.setup.paymentPort
        .createStripeSession(params)
        .catch((error: Error) => error);

      promises.push(promise);
    }

    // 全ての実行を待機
    const outcomes = await Promise.all(promises);
    const totalTime = Date.now() - startTime;

    // 結果を分類
    const results: CreateStripeSessionResult[] = [];
    const errors: Error[] = [];

    outcomes.forEach((outcome) => {
      if (outcome instanceof Error) {
        errors.push(outcome);
      } else {
        results.push(outcome);
      }
    });

    // 一意のセッションIDを抽出
    const uniqueSessionIds = [...new Set(results.map((r) => r.sessionId))];

    // 最終的な決済レコードを確認
    const { payments } = await this.getCurrentPaymentState();

    return {
      results,
      errors,
      timings: [totalTime], // 総実行時間
      uniqueSessionIds,
      paymentRecords: payments,
    };
  }

  /**
   * Terminal状態の決済が存在する場合のガード動作をテスト
   */
  async testTerminalStateGuard(terminalStatus: PaymentStatus): Promise<{
    terminalPaymentId: string;
    errorThrown: boolean;
    errorType: PaymentErrorType | null;
    errorMessage: string | null;
  }> {
    // Terminal状態の決済を作成
    const terminalPaymentId = await this.createPaymentWithStatus(terminalStatus, {
      paidAt: new Date(),
      stripePaymentIntentId: `pi_test_terminal_${terminalStatus}_${Date.now()}`,
    });

    let errorThrown = false;
    let errorType: PaymentErrorType | null = null;
    let errorMessage: string | null = null;

    try {
      // セッション作成を試行（エラーが発生すべき）
      await this.setup.paymentPort.createStripeSession(this.setup.createSessionParams);
    } catch (error) {
      errorThrown = true;
      if (error instanceof PaymentError) {
        errorType = error.type;
        errorMessage = error.message;
      } else {
        errorMessage = error instanceof Error ? error.message : String(error);
      }
    }

    return {
      terminalPaymentId,
      errorThrown,
      errorType,
      errorMessage,
    };
  }

  /**
   * failed → pending のステータス遷移をテスト
   */
  async testFailedToPendingTransition(): Promise<{
    failedPaymentId: string;
    sessionResult: CreateStripeSessionResult;
    pendingPaymentCreated: boolean;
    totalPaymentCount: number;
    failedPaymentUntouched: boolean;
  }> {
    // failed状態の決済を作成
    const failedPaymentId = await this.createPaymentWithStatus("failed");

    // セッション作成を実行
    const sessionResult = await this.setup.paymentPort.createStripeSession(
      this.setup.createSessionParams
    );

    // 結果を検証
    const { payments } = await this.getCurrentPaymentState();
    const pendingPayments = payments.filter((p) => p.status === "pending");
    const failedPayments = payments.filter((p) => p.status === "failed");

    return {
      failedPaymentId,
      sessionResult,
      pendingPaymentCreated: pendingPayments.length > 0,
      totalPaymentCount: payments.length,
      failedPaymentUntouched: failedPayments.some((p) => p.id === failedPaymentId),
    };
  }

  /**
   * DB制約違反からの回復をテスト（同時実行シミュレーション）
   */
  async testConstraintViolationRecovery(): Promise<{
    constraintViolated: boolean;
    recoverySuccessful: boolean;
    finalResult: CreateStripeSessionResult;
    uniquePaymentCount: number;
  }> {
    // pending決済を事前作成（制約の基準となる）
    await this.createPaymentWithStatus("pending");

    let constraintViolated = false;
    let recoverySuccessful = false;
    let finalResult: CreateStripeSessionResult;

    try {
      // セッション作成を試行（制約違反が発生する可能性があるが、回復すべき）
      finalResult = await this.setup.paymentPort.createStripeSession(
        this.setup.createSessionParams
      );
      recoverySuccessful = true;
    } catch (error) {
      // 制約違反が発生したが回復に失敗した場合
      if (error instanceof Error && error.message.includes("23505")) {
        constraintViolated = true;
      }
      throw error;
    }

    // 最終的な決済レコード数を確認
    const { payments } = await this.getCurrentPaymentState();
    const uniquePaymentIds = [...new Set(payments.map((p) => p.id))];

    if (!finalResult) {
      throw new Error("Final result should be defined when recovery is successful");
    }

    return {
      constraintViolated,
      recoverySuccessful,
      finalResult: finalResult,
      uniquePaymentCount: uniquePaymentIds.length,
    };
  }

  /**
   * Stripe APIモック設定用ヘルパー
   */
  static setupStripeApiMocks(): {
    mockCreateCheckoutSession: jest.MockedFunction<any>;
  } {
    // Stripe Checkout Session作成のモック
    const mockCreateCheckoutSession = jest.fn();

    return {
      mockCreateCheckoutSession,
    };
  }

  /**
   * テストデータクリーンアップ
   * @deprecated 共通セットアップ関数のcleanupを使用してください。このメソッドは後方互換性のために残されています。
   */
  async cleanup(): Promise<void> {
    // 共通セットアップ関数のcleanupを使用
    await this.setup.cleanup();
  }
}

/**
 * 冪等性テスト用の共通検証関数
 */
export class IdempotencyTestValidators {
  /**
   * 基本冪等性の検証
   */
  static validateBasicIdempotency(results: CreateStripeSessionResult[]): {
    isIdempotent: boolean;
    uniqueSessionIds: string[];
    inconsistencies: string[];
  } {
    const uniqueSessionIds = [...new Set(results.map((r) => r.sessionId))];
    const uniqueUrls = [...new Set(results.map((r) => r.sessionUrl))];

    const inconsistencies: string[] = [];

    if (uniqueSessionIds.length > 1) {
      inconsistencies.push(`Session IDs not consistent: ${uniqueSessionIds.join(", ")}`);
    }

    if (uniqueUrls.length > 1) {
      inconsistencies.push(`Session URLs not consistent: ${uniqueUrls.length} unique URLs`);
    }

    return {
      isIdempotent: inconsistencies.length === 0,
      uniqueSessionIds,
      inconsistencies,
    };
  }

  /**
   * 並行実行結果の検証
   */
  static validateConcurrentExecution(result: ConcurrentTestResult): {
    isValid: boolean;
    issues: string[];
    successRate: number;
  } {
    const issues: string[] = [];
    const totalAttempts = result.results.length + result.errors.length;
    const successRate = totalAttempts > 0 ? result.results.length / totalAttempts : 0;

    // 決済レコードは1つだけ存在すべき
    const pendingPayments = result.paymentRecords.filter((p) => p.status === "pending");
    if (pendingPayments.length !== 1) {
      issues.push(`Expected 1 pending payment, found ${pendingPayments.length}`);
    }

    // エラーは制約違反からの回復失敗のみ許容
    const unexpectedErrors = result.errors.filter(
      (error) => !(error instanceof PaymentError && error.type === PaymentErrorType.DATABASE_ERROR)
    );
    if (unexpectedErrors.length > 0) {
      issues.push(`Unexpected errors: ${unexpectedErrors.length}`);
    }

    return {
      isValid: issues.length === 0,
      issues,
      successRate,
    };
  }

  /**
   * Idempotency Key回転の検証
   */
  static validateIdempotencyKeyRotation(result: IdempotencyKeyTestResult): {
    isValid: boolean;
    rotationWorked: boolean;
    revisionIncremented: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    // キーが回転したかチェック
    if (!result.keyRotated) {
      issues.push("Idempotency key was not rotated on amount change");
    }

    // リビジョンが増加したかチェック
    const revisionIncremented = result.keyRevision > 0;
    if (!revisionIncremented) {
      issues.push("Checkout key revision was not incremented");
    }

    // セッションIDは異なるべき
    if (result.initialResult.sessionId === result.repeatedResult.sessionId) {
      issues.push("Session ID did not change after amount change");
    }

    return {
      isValid: issues.length === 0,
      rotationWorked: result.keyRotated,
      revisionIncremented,
      issues,
    };
  }
}
