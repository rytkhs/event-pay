/**
 * TC-RC-001: 定員超過レースコンディション対応テスト
 *
 * 仕様書: P0-3_race_condition_specification.md
 */

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";

import type { ParticipationFormData } from "@core/validation/participation";

import type { Database } from "@/types/database";

import { createPaidTestEvent } from "@tests/helpers/test-payment-data";

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

describe("TC-RC-001: 定員超過レースコンディション対応テスト", () => {
  let setup: RaceConditionTestSetup;
  let testData: RaceConditionTestData;
  let securityLogCapture: ReturnType<
    typeof import("@tests/helpers/test-mock-setup").MockSetupHelper.captureSecurityLogs
  >;

  beforeEach(async () => {
    setup = await setupRaceConditionTest({
      organizerEmail: "test-organizer@example.com",
      eventOptions: {
        title: "定員1名レースコンディションテスト",
        capacity: 1, // 重要: 定員1名
        fee: 1000,
        payment_methods: ["stripe"] as PaymentMethod[],
      },
    });
    testData = setup.testData as RaceConditionTestData;
    securityLogCapture = setup.securityLogCapture;
  });

  afterEach(async () => {
    await setup.cleanup();
  });

  it("定員1名のイベントに2名が同時参加登録 → 1名のみ成功すること", async () => {
    // テスト対象データ準備
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
      email: "user-b@example.com",
      attendanceStatus: "attending" as AttendanceStatus,
      paymentMethod: "stripe" as PaymentMethod,
    };

    // 【レースコンディション実行】2つのリクエストを同時実行
    const concurrentResult = await ConcurrentRequestHelper.executeParticipationRequests(
      [participantA, participantB],
      { timeout: 10000 } // 10秒タイムアウト
    );

    // 【期待結果検証1】正確に1つのリクエストのみ成功
    const oneSuccessVerification = ConcurrentRequestHelper.verifyExactlyOneSuccess(
      concurrentResult.results
    );

    expect(oneSuccessVerification.success).toBe(true);
    expect(oneSuccessVerification.successCount).toBe(1);
    expect(oneSuccessVerification.failureCount).toBe(1);

    // 【期待結果検証2】成功リクエストの内容確認
    const successResult = oneSuccessVerification.successResult;
    expect(successResult).toBeDefined();
    expect(successResult!.success).toBe(true);
    expect(successResult!.data?.attendanceId).toBeDefined();
    expect(successResult!.data?.guestToken).toBeDefined();
    expect(successResult!.data?.requiresAdditionalPayment).toBe(true);

    // 【期待結果検証3】失敗リクエストのエラー検証
    const errorVerification = ConcurrentRequestHelper.verifyExpectedErrors(
      concurrentResult.failureResults,
      "RESOURCE_CONFLICT", // 仕様書で定義されたエラー型
      "このイベントは定員に達しています" // 仕様書で定義されたエラーメッセージ
    );

    expect(errorVerification.success).toBe(true);
    expect(errorVerification.matchingErrors).toBe(1);

    // 【データ整合性検証1】参加者数が定員を超過していないこと
    const attendanceCountVerification = await DatabaseStateHelper.verifyAttendanceCount(
      testData.testEvent.id,
      1 // 期待値: 1名（定員内）
    );

    expect(attendanceCountVerification.isValid).toBe(true);
    expect(attendanceCountVerification.actualCount).toBe(1);

    // 【データ整合性検証2】決済レコード数が参加者数と一致すること
    const paymentConsistencyVerification = await DatabaseStateHelper.verifyPaymentConsistency(
      testData.testEvent.id
    );

    expect(paymentConsistencyVerification.isConsistent).toBe(true);
    expect(paymentConsistencyVerification.paymentCount).toBe(1);

    // 【データ整合性検証3】孤立した決済レコードが存在しないこと
    const orphanVerification = await DatabaseStateHelper.verifyNoOrphanedPayments(
      testData.testEvent.id
    );

    expect(orphanVerification.hasOrphans).toBe(false);

    // 【データ整合性検証4】メールアドレスの重複が存在しないこと
    const duplicateEmailVerification = await DatabaseStateHelper.verifyNoDuplicateEmails(
      testData.testEvent.id
    );

    expect(duplicateEmailVerification.hasDuplicates).toBe(false);

    // 【セキュリティログ検証】適切なレースコンディションイベントが記録されること
    const securityLogs = securityLogCapture.logs;
    const raceConditionLogs = securityLogs.filter(
      (log) => log.type === "CAPACITY_RACE_CONDITION" || log.type === "CAPACITY_BYPASS_ATTEMPT"
    );

    // レースコンディション関連ログが記録されていることを確認
    // 注意: ログは成功・失敗の両方で記録される場合があるため、最低1件の記録があることを確認
    expect(raceConditionLogs.length).toBeGreaterThanOrEqual(1);

    // ログの内容検証
    const capacityLog = raceConditionLogs.find(
      (log) => log.details?.eventId === testData.testEvent.id
    );
    expect(capacityLog).toBeDefined();
  });

  it("定員1名のイベントに3名が同時参加登録 → 1名のみ成功すること", async () => {
    // より多くの同時リクエストでのテスト
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
      { timeout: 15000 } // より長いタイムアウト
    );

    // 正確に1つのリクエストのみ成功
    const verification = ConcurrentRequestHelper.verifyExactlyOneSuccess(concurrentResult.results);
    expect(verification.success).toBe(true);
    expect(verification.successCount).toBe(1);
    expect(verification.failureCount).toBe(2);

    // 失敗した2つのリクエストがすべて期待されるエラー型
    const errorVerification = ConcurrentRequestHelper.verifyExpectedErrors(
      concurrentResult.failureResults,
      "RESOURCE_CONFLICT"
    );
    expect(errorVerification.success).toBe(true);
    expect(errorVerification.matchingErrors).toBe(2);

    // データベース整合性確認
    const dbStateVerification = await DatabaseStateHelper.verifyDatabaseState({
      eventId: testData.testEvent.id,
      expectedAttendingCount: 1,
    });

    expect(dbStateVerification.isValid).toBe(true);
  });

  it("定員制限なしイベントでは複数名が同時参加可能なこと（対照テスト）", async () => {
    // 定員制限なしのイベント作成
    const unlimitedEvent = await createPaidTestEvent(testData.organizer.id, {
      title: "定員制限なしレースコンディション対照テスト",
      capacity: null, // 定員制限なし
      fee: 1000,
      payment_methods: ["stripe"] as PaymentMethod[],
    });

    const participants: ParticipationFormData[] = [
      {
        inviteToken: unlimitedEvent.invite_token,
        nickname: "対照参加者1",
        email: "control-user-1@example.com",
        attendanceStatus: "attending" as AttendanceStatus,
        paymentMethod: "stripe" as PaymentMethod,
      },
      {
        inviteToken: unlimitedEvent.invite_token,
        nickname: "対照参加者2",
        email: "control-user-2@example.com",
        attendanceStatus: "attending" as AttendanceStatus,
        paymentMethod: "stripe" as PaymentMethod,
      },
    ];

    // 同時実行
    const concurrentResult = await ConcurrentRequestHelper.executeParticipationRequests(
      participants,
      { timeout: 10000 }
    );

    // 定員制限がないため、両方とも成功するはず
    expect(concurrentResult.successCount).toBe(2);
    expect(concurrentResult.failureCount).toBe(0);

    // データベース整合性確認
    const dbStateVerification = await DatabaseStateHelper.verifyDatabaseState({
      eventId: unlimitedEvent.id,
      expectedAttendingCount: 2,
    });

    expect(dbStateVerification.isValid).toBe(true);
  });

  it("not_attending参加者は定員に影響しないこと", async () => {
    const participants: ParticipationFormData[] = [
      {
        inviteToken: testData.testEvent.invite_token,
        nickname: "不参加者A",
        email: "not-attending-a@example.com",
        attendanceStatus: "not_attending" as AttendanceStatus,
        // paymentMethodは不参加のため未設定
      },
      {
        inviteToken: testData.testEvent.invite_token,
        nickname: "参加者A",
        email: "attending-a@example.com",
        attendanceStatus: "attending" as AttendanceStatus,
        paymentMethod: "stripe" as PaymentMethod,
      },
    ];

    // 同時実行
    const concurrentResult = await ConcurrentRequestHelper.executeParticipationRequests(
      participants,
      { timeout: 10000 }
    );

    // not_attendingは定員に影響しないため、両方成功するはず
    expect(concurrentResult.successCount).toBe(2);
    expect(concurrentResult.failureCount).toBe(0);

    // attendingステータスの参加者数は1名
    const attendingCountVerification = await DatabaseStateHelper.verifyAttendanceCount(
      testData.testEvent.id,
      1, // attending のみ
      "attending"
    );
    expect(attendingCountVerification.isValid).toBe(true);

    // not_attendingステータスの参加者数は1名
    const notAttendingCountVerification = await DatabaseStateHelper.verifyAttendanceCount(
      testData.testEvent.id,
      1, // not_attending のみ
      "not_attending"
    );
    expect(notAttendingCountVerification.isValid).toBe(true);
  });

  it("maybe参加者は定員に影響しないこと", async () => {
    const participants: ParticipationFormData[] = [
      {
        inviteToken: testData.testEvent.invite_token,
        nickname: "検討中参加者A",
        email: "maybe-a@example.com",
        attendanceStatus: "maybe" as AttendanceStatus,
        // paymentMethodはmaybeのため未設定
      },
      {
        inviteToken: testData.testEvent.invite_token,
        nickname: "参加者A",
        email: "attending-a@example.com",
        attendanceStatus: "attending" as AttendanceStatus,
        paymentMethod: "stripe" as PaymentMethod,
      },
    ];

    // 同時実行
    const concurrentResult = await ConcurrentRequestHelper.executeParticipationRequests(
      participants,
      { timeout: 10000 }
    );

    // maybeは定員に影響しないため、両方成功するはず
    expect(concurrentResult.successCount).toBe(2);
    expect(concurrentResult.failureCount).toBe(0);

    // attendingステータスの参加者数は1名
    const attendingCountVerification = await DatabaseStateHelper.verifyAttendanceCount(
      testData.testEvent.id,
      1,
      "attending"
    );
    expect(attendingCountVerification.isValid).toBe(true);

    // maybeステータスの参加者数は1名
    const maybeCountVerification = await DatabaseStateHelper.verifyAttendanceCount(
      testData.testEvent.id,
      1,
      "maybe"
    );
    expect(maybeCountVerification.isValid).toBe(true);
  });
});
