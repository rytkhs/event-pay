/**
 * TC-RC-003: ゲストトークン重複レースコンディション対応テスト
 *
 * 仕様書: P0-3_race_condition_specification.md
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";

import type { ParticipationFormData } from "@core/validation/participation";

import { MockSetupHelper } from "@tests/helpers/test-mock-setup";

import type { Database } from "@/types/database";

import { ConcurrentRequestHelper } from "../helpers/concurrent-request.helper";
import { DatabaseStateHelper } from "../helpers/database-state.helper";
import {
  setupRaceConditionTest,
  type RaceConditionTestData,
  type RaceConditionTestSetup,
} from "../helpers/test-race-condition-setup";

// テスト用型定義
type AttendanceStatus = Database["public"]["Enums"]["attendance_status_enum"];
type PaymentMethod = Database["public"]["Enums"]["payment_method_enum"];

describe("TC-RC-003: ゲストトークン重複レースコンディション対応テスト", () => {
  let setup: RaceConditionTestSetup;
  let testData: RaceConditionTestData;
  let securityLogCapture: ReturnType<
    typeof import("@tests/helpers/test-mock-setup").MockSetupHelper.captureSecurityLogs
  >;

  beforeEach(async () => {
    setup = await setupRaceConditionTest({
      organizerEmail: "token-dup-test-organizer@example.com",
      eventOptions: {
        title: "ゲストトークン重複レースコンディションテスト",
        capacity: null, // 定員制限なし（トークン重複のみに焦点）
        fee: 1000, // 有料イベント
        payment_methods: ["stripe"] as PaymentMethod[],
      },
    });
    testData = setup.testData as RaceConditionTestData;
    securityLogCapture = setup.securityLogCapture;
  });

  afterEach(async () => {
    await setup.cleanup();
  });

  it("意図的に重複したゲストトークンで2名が同時参加登録 → 適切にエラーハンドリングされること", async () => {
    // 【重要】ゲストトークン生成をモック化して意図的な重複を発生させる（仕様書通り）
    const { mockToken, mockFn, teardown } = MockSetupHelper.setupDuplicateGuestTokenTest(2);

    try {
      // 異なるメールアドレスでの参加データ（トークン重複のみをテスト）
      const participantA: ParticipationFormData = {
        inviteToken: testData.testEvent.invite_token,
        nickname: "参加者A",
        email: "user-a@example.com",
        attendanceStatus: "attending" as AttendanceStatus,
        paymentMethod: "stripe" as PaymentMethod,
      };

      const participantB: ParticipationFormData = {
        inviteToken: testData.testEvent.invite_token,
        nickname: "参加者B",
        email: "user-b@example.com", // 異なるメールアドレス
        attendanceStatus: "attending" as AttendanceStatus,
        paymentMethod: "stripe" as PaymentMethod,
      };

      // モック関数が正しく設定されているか確認
      expect(mockFn).toHaveBeenCalledTimes(0); // まだ呼ばれていない

      // 【レースコンディション実行】同一ゲストトークンで同時実行
      const concurrentResult = await ConcurrentRequestHelper.executeParticipationRequests(
        [participantA, participantB],
        { timeout: 10000 }
      );

      // モック関数が呼び出されたことを確認
      expect(mockFn).toHaveBeenCalled();

      // 【期待結果検証1】同一ゲストトークンの場合、ストアドプロシージャの事前チェック（1073-1075行目）により
      // トランザクション分離レベルとタイミングに依存して以下のいずれかになる：
      // - 両方が失敗（0成功, 2失敗）: 両方が事前チェックを通過し、同時にINSERTを試みた場合
      // - 1つが成功、1つが失敗（1成功, 1失敗）: 1つ目がコミット後、2つ目が事前チェックで検出された場合
      const totalRequests = concurrentResult.successCount + concurrentResult.failureCount;
      expect(totalRequests).toBe(2); // 2つのリクエストが処理された

      // 重複トークンのため、少なくとも1つは失敗するはず（最大で2つとも失敗）
      expect(concurrentResult.failureCount).toBeGreaterThanOrEqual(1);
      expect(concurrentResult.successCount).toBeLessThanOrEqual(1);

      // 【期待結果検証2】失敗したリクエストが適切なシステムエラーであることを確認
      if (concurrentResult.failureCount > 0) {
        const errorVerification = ConcurrentRequestHelper.verifyExpectedErrors(
          concurrentResult.failureResults,
          "INTERNAL_ERROR"
        );
        expect(errorVerification.success).toBe(true);
        expect(errorVerification.matchingErrors).toBe(concurrentResult.failureCount);

        // 【期待結果検証3】エラーメッセージがユーザーフレンドリーであることを確認
        concurrentResult.failureResults.forEach((failureResult) => {
          expect(failureResult.error?.message).toBe(
            "システムエラーが発生しました。恐れ入りますが、再度お試しください"
          );
        });
      }

      // 【データ整合性検証1】参加者数が0名または1名（成功したリクエスト数と一致）
      const attendanceCountVerification = await DatabaseStateHelper.verifyAttendanceCount(
        testData.testEvent.id,
        concurrentResult.successCount
      );

      expect(attendanceCountVerification.isValid).toBe(true);
      expect(attendanceCountVerification.actualCount).toBe(concurrentResult.successCount);

      // 【データ整合性検証2】決済レコード数が参加者数と一致
      const paymentConsistencyVerification = await DatabaseStateHelper.verifyPaymentConsistency(
        testData.testEvent.id
      );

      expect(paymentConsistencyVerification.isConsistent).toBe(true);
      expect(paymentConsistencyVerification.paymentCount).toBe(concurrentResult.successCount);

      // 【データ整合性検証3】重複メールアドレスは存在しない（トークン重複は異なるメールのため）
      const duplicateEmailVerification = await DatabaseStateHelper.verifyNoDuplicateEmails(
        testData.testEvent.id
      );

      expect(duplicateEmailVerification.hasDuplicates).toBe(false);

      // 【セキュリティログ検証】適切なトークン衝突イベントが記録されること（仕様書準拠）
      const securityLogs = securityLogCapture.logs;
      const tokenCollisionLogs = securityLogs.filter(
        (log) => log.type === "SUSPICIOUS_ACTIVITY" && log.message.includes("guest token collision")
      );

      expect(tokenCollisionLogs.length).toBeGreaterThanOrEqual(1);

      // ログの詳細検証
      const collisionLog = tokenCollisionLogs.find(
        (log) =>
          log.details?.eventId === testData.testEvent.id &&
          log.message.includes("Rare guest token collision detected during RPC execution")
      );
      expect(collisionLog).toBeDefined();
      expect(collisionLog?.details?.tokenLength).toBeDefined();
      expect(collisionLog?.details?.tokenPrefix).toBeDefined();
    } finally {
      // モックのクリーンアップ
      teardown();
    }
  });

  it("ゲストトークン重複で3名が同時参加登録 → 適切にエラーハンドリングされること", async () => {
    // 3名での重複トークンテスト
    const { mockToken, mockFn, teardown } = MockSetupHelper.setupDuplicateGuestTokenTest(3);

    try {
      const participants: ParticipationFormData[] = [
        {
          inviteToken: testData.testEvent.invite_token,
          nickname: "参加者X",
          email: "user-x@example.com",
          attendanceStatus: "attending" as AttendanceStatus,
          paymentMethod: "stripe" as PaymentMethod,
        },
        {
          inviteToken: testData.testEvent.invite_token,
          nickname: "参加者Y",
          email: "user-y@example.com",
          attendanceStatus: "attending" as AttendanceStatus,
          paymentMethod: "stripe" as PaymentMethod,
        },
        {
          inviteToken: testData.testEvent.invite_token,
          nickname: "参加者Z",
          email: "user-z@example.com",
          attendanceStatus: "attending" as AttendanceStatus,
          paymentMethod: "stripe" as PaymentMethod,
        },
      ];

      // 同時実行
      const concurrentResult = await ConcurrentRequestHelper.executeParticipationRequests(
        participants,
        { timeout: 15000 }
      );

      // 実装では重複トークンにより、0～1個のリクエストが成功、残りは失敗
      const totalRequests = concurrentResult.successCount + concurrentResult.failureCount;
      expect(totalRequests).toBe(3);
      expect(concurrentResult.failureCount).toBeGreaterThanOrEqual(2); // 少なくとも2つは失敗
      expect(concurrentResult.successCount).toBeLessThanOrEqual(1); // 最大1つのみ成功

      // 失敗したリクエストがすべて期待されるエラー型
      if (concurrentResult.failureCount > 0) {
        const errorVerification = ConcurrentRequestHelper.verifyExpectedErrors(
          concurrentResult.failureResults,
          "INTERNAL_ERROR"
        );
        expect(errorVerification.success).toBe(true);
        expect(errorVerification.matchingErrors).toBe(concurrentResult.failureCount);
      }

      // データベース整合性確認
      const dbStateVerification = await DatabaseStateHelper.verifyDatabaseState({
        eventId: testData.testEvent.id,
        expectedAttendingCount: concurrentResult.successCount,
      });

      expect(dbStateVerification.isValid).toBe(true);
    } finally {
      teardown();
    }
  });

  it("正常なゲストトークン生成では複数名が同時参加可能なこと（対照テスト）", async () => {
    // モックなしで正常なトークン生成をテスト
    const participants: ParticipationFormData[] = [
      {
        inviteToken: testData.testEvent.invite_token,
        nickname: "正常参加者1",
        email: "normal-user-1@example.com",
        attendanceStatus: "attending" as AttendanceStatus,
        paymentMethod: "stripe" as PaymentMethod,
      },
      {
        inviteToken: testData.testEvent.invite_token,
        nickname: "正常参加者2",
        email: "normal-user-2@example.com",
        attendanceStatus: "attending" as AttendanceStatus,
        paymentMethod: "stripe" as PaymentMethod,
      },
    ];

    // 同時実行
    const concurrentResult = await ConcurrentRequestHelper.executeParticipationRequests(
      participants,
      { timeout: 10000 }
    );

    // 正常なトークン生成なので両方とも成功するはず
    expect(concurrentResult.successCount).toBe(2);
    expect(concurrentResult.failureCount).toBe(0);

    // 参加者数は2名
    const attendanceCountVerification = await DatabaseStateHelper.verifyAttendanceCount(
      testData.testEvent.id,
      2
    );
    expect(attendanceCountVerification.isValid).toBe(true);

    // 決済レコード数も2件
    const paymentConsistencyVerification = await DatabaseStateHelper.verifyPaymentConsistency(
      testData.testEvent.id
    );
    expect(paymentConsistencyVerification.isConsistent).toBe(true);
    expect(paymentConsistencyVerification.paymentCount).toBe(2);
  });

  it("ゲストトークン重複エラーが適切にキャッチされ、ユーザーフレンドリーなメッセージになること", async () => {
    const { mockToken, teardown } = MockSetupHelper.setupDuplicateGuestTokenTest(2);

    try {
      const participants: ParticipationFormData[] = [
        {
          inviteToken: testData.testEvent.invite_token,
          nickname: "エラーテスト参加者A",
          email: "error-test-a@example.com",
          attendanceStatus: "attending" as AttendanceStatus,
          paymentMethod: "stripe" as PaymentMethod,
        },
        {
          inviteToken: testData.testEvent.invite_token,
          nickname: "エラーテスト参加者B",
          email: "error-test-b@example.com",
          attendanceStatus: "attending" as AttendanceStatus,
          paymentMethod: "stripe" as PaymentMethod,
        },
      ];

      const concurrentResult = await ConcurrentRequestHelper.executeParticipationRequests(
        participants,
        { timeout: 10000 }
      );

      // 実装では重複トークンにより、0～1個のリクエストが成功、残りは失敗
      const totalRequests = concurrentResult.successCount + concurrentResult.failureCount;
      expect(totalRequests).toBe(2);
      expect(concurrentResult.failureCount).toBeGreaterThanOrEqual(1); // 少なくとも1つは失敗
      expect(concurrentResult.successCount).toBeLessThanOrEqual(1); // 最大1つのみ成功

      // 失敗リクエストのエラーメッセージがユーザーフレンドリーであることを確認
      if (concurrentResult.failureCount > 0) {
        const failedResult = concurrentResult.failureResults[0];
        expect(failedResult.error?.type).toBe("INTERNAL_ERROR");
        expect(failedResult.error?.message).toBe(
          "システムエラーが発生しました。恐れ入りますが、再度お試しください"
        );

        // データベース情報の漏洩がないことを確認（セキュリティ要件）
        expect(failedResult.error?.message).not.toContain("token");
        expect(failedResult.error?.message).not.toContain("duplicate");
        expect(failedResult.error?.message).not.toContain("constraint");
        expect(failedResult.error?.message).not.toContain("violation");
      }
    } finally {
      teardown();
    }
  });

  it("ゲストトークンが正しく保存され、検証できること", async () => {
    // 単一の参加登録でトークン保存・検証の確認
    const participant: ParticipationFormData = {
      inviteToken: testData.testEvent.invite_token,
      nickname: "トークン検証参加者",
      email: "token-verification@example.com",
      attendanceStatus: "attending" as AttendanceStatus,
      paymentMethod: "stripe" as PaymentMethod,
    };

    const concurrentResult = await ConcurrentRequestHelper.executeParticipationRequests(
      [participant],
      { timeout: 10000 }
    );

    expect(concurrentResult.successCount).toBe(1);
    const successResult = concurrentResult.successResults[0];
    const attendanceId = successResult.data?.attendanceId;
    const guestToken = successResult.data?.guestToken;

    expect(attendanceId).toBeDefined();
    expect(guestToken).toBeDefined();
    expect(guestToken?.startsWith("gst_")).toBe(true);
    expect(guestToken?.length).toBe(36); // "gst_" + 32文字

    // セキュリティログでトークン検証成功が記録されていることを確認
    const securityLogs = securityLogCapture.logs;
    const verificationLogs = securityLogs.filter((log) =>
      log.message.includes("Guest token storage verification completed successfully")
    );

    // 開発環境でのみログ記録されるため、存在する場合のみ検証
    if (verificationLogs.length > 0) {
      const verificationLog = verificationLogs[0];
      expect(verificationLog.details?.attendanceId).toBe(attendanceId);
      expect(verificationLog.details?.tokenLength).toBe(36);
    }
  });

  it("ゲストトークン生成関数のモック設定が正しく動作すること（単体テスト要素）", async () => {
    const mockSetup = MockSetupHelper.setupDuplicateGuestTokenTest(1);

    try {
      // モック関数を直接呼び出してテスト
      const guestTokenUtils = await import("@core/utils/guest-token");
      const generatedToken = guestTokenUtils.generateGuestToken();

      // MockSetupHelperが実際に返すトークンを使用
      expect(generatedToken).toBe(mockSetup.mockToken);
      expect(mockSetup.mockFn).toHaveBeenCalledTimes(1);
    } finally {
      mockSetup.teardown();
    }
  });
});
