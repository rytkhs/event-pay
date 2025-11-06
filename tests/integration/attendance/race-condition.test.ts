/**
 * レースコンディションテスト統合ファイル
 *
 * 以下の3つのテストケースを統合：
 * - TC-RC-001: 定員超過レースコンディション
 * - TC-RC-002: メール重複レースコンディション
 * - TC-RC-003: ゲストトークン重複レースコンディション
 *
 * 仕様書: P0-3_race_condition_specification.md
 */

import { describe, it, expect, beforeEach, afterEach, jest } from "@jest/globals";

import type { ParticipationFormData } from "@core/validation/participation";

import { MockSetupHelper } from "@tests/helpers/mock-setup.helper";

import type { Database } from "@/types/database";

import { ConcurrentRequestHelper } from "./helpers/concurrent-request.helper";
import { DatabaseStateHelper } from "./helpers/database-state.helper";
import {
  setupRaceConditionTest,
  type RaceConditionTestData,
  type RaceConditionTestDataWithFreeEvent,
  type RaceConditionTestSetup,
} from "./helpers/race-condition-setup.helper";

// テスト用型定義
type AttendanceStatus = Database["public"]["Enums"]["attendance_status_enum"];
type PaymentMethod = Database["public"]["Enums"]["payment_method_enum"];

describe("レースコンディションテスト", () => {
  describe("TC-RC-001: 定員超過レースコンディション対応テスト", () => {
    let setup: RaceConditionTestSetup;
    let testData: RaceConditionTestData;
    let securityLogCapture: ReturnType<
      typeof import("@tests/helpers/mock-setup.helper").MockSetupHelper.captureSecurityLogs
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
      const verification = ConcurrentRequestHelper.verifyExactlyOneSuccess(
        concurrentResult.results
      );
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

  describe("TC-RC-002: メール重複レースコンディション対応テスト", () => {
    let setup: RaceConditionTestSetup;
    let testData: RaceConditionTestDataWithFreeEvent;
    let securityLogCapture: ReturnType<
      typeof import("@tests/helpers/mock-setup.helper").MockSetupHelper.captureSecurityLogs
    >;

    beforeEach(async () => {
      setup = await setupRaceConditionTest({
        organizerEmail: "email-dup-test-organizer@example.com",
        eventOptions: {
          title: "メール重複レースコンディションテスト（有料）",
          capacity: null, // 定員制限なし（メール重複のみに焦点）
          fee: 1000,
          payment_methods: ["stripe"] as PaymentMethod[],
        },
        createFreeEvent: true,
      });
      testData = setup.testData as RaceConditionTestDataWithFreeEvent;
      securityLogCapture = setup.securityLogCapture;
    });

    afterEach(async () => {
      await setup.cleanup();
    });

    it("同一メールアドレスで2名が同時参加登録 → 1名のみ成功すること（無料イベント）", async () => {
      const duplicateEmail = "duplicate-test@example.com";

      // 同一メールアドレスでの参加データ（仕様書通り）
      const participantA: ParticipationFormData = {
        inviteToken: testData.freeEvent.invite_token,
        nickname: "重複者1",
        email: duplicateEmail,
        attendanceStatus: "attending" as AttendanceStatus,
        // 無料イベントのためpaymentMethodは未設定
      };

      const participantB: ParticipationFormData = {
        inviteToken: testData.freeEvent.invite_token,
        nickname: "重複者2",
        email: duplicateEmail, // 同じメールアドレス
        attendanceStatus: "attending" as AttendanceStatus,
      };

      // 【レースコンディション実行】同一メールアドレスで同時実行
      const concurrentResult = await ConcurrentRequestHelper.executeParticipationRequests(
        [participantA, participantB],
        { timeout: 10000 }
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
      expect(successResult!.data?.requiresAdditionalPayment).toBe(false); // 無料イベント

      // 【期待結果検証3】失敗リクエストのエラー検証（仕様書準拠）
      const errorVerification = ConcurrentRequestHelper.verifyExpectedErrors(
        concurrentResult.failureResults,
        "DUPLICATE_REGISTRATION", // 仕様書で定義されたエラー型
        "このメールアドレスは既にこのイベントに登録されています" // 仕様書で定義されたメッセージ
      );

      expect(errorVerification.success).toBe(true);
      expect(errorVerification.matchingErrors).toBe(1);

      // 【データ整合性検証1】同一メールアドレスの参加記録が1つのみ
      const duplicateEmailVerification = await DatabaseStateHelper.verifyNoDuplicateEmails(
        testData.freeEvent.id
      );

      expect(duplicateEmailVerification.hasDuplicates).toBe(false);

      // 【データ整合性検証2】参加者数が正しく1名
      const attendanceCountVerification = await DatabaseStateHelper.verifyAttendanceCount(
        testData.freeEvent.id,
        1 // 期待値: 1名のみ
      );

      expect(attendanceCountVerification.isValid).toBe(true);
      expect(attendanceCountVerification.actualCount).toBe(1);

      // 【セキュリティログ検証】重複登録検出イベントが記録されること（仕様書準拠）
      const securityLogs = securityLogCapture.logs;
      const duplicateRegistrationLogs = securityLogs.filter(
        (log) => log.type === "DUPLICATE_REGISTRATION"
      );

      expect(duplicateRegistrationLogs.length).toBeGreaterThanOrEqual(1);

      // ログの詳細検証
      const duplicateLog = duplicateRegistrationLogs.find(
        (log) =>
          log.details?.eventId === testData.freeEvent.id && log.details?.email === duplicateEmail
      );
      expect(duplicateLog).toBeDefined();
      expect(duplicateLog?.message).toContain("Duplicate email registration attempt detected");
    });

    it("同一メールアドレスで3名が同時参加登録 → 1名のみ成功すること（仕様書補強）", async () => {
      const duplicateEmail = "triple-duplicate-test@example.com";

      // 3つの同一メールアドレスでの参加データ（仕様書3.2節の3名パターン）
      const participants: ParticipationFormData[] = [
        {
          inviteToken: testData.freeEvent.invite_token,
          nickname: "重複者1",
          email: duplicateEmail,
          attendanceStatus: "attending" as AttendanceStatus,
        },
        {
          inviteToken: testData.freeEvent.invite_token,
          nickname: "重複者2",
          email: duplicateEmail,
          attendanceStatus: "attending" as AttendanceStatus,
        },
        {
          inviteToken: testData.freeEvent.invite_token,
          nickname: "重複者3",
          email: duplicateEmail,
          attendanceStatus: "attending" as AttendanceStatus,
        },
      ];

      // 同時実行
      const concurrentResult = await ConcurrentRequestHelper.executeParticipationRequests(
        participants,
        { timeout: 15000 }
      );

      // 正確に1つのリクエストのみ成功
      const verification = ConcurrentRequestHelper.verifyExactlyOneSuccess(
        concurrentResult.results
      );
      expect(verification.success).toBe(true);
      expect(verification.successCount).toBe(1);
      expect(verification.failureCount).toBe(2);

      // 失敗した2つのリクエストがすべて期待されるエラー型
      const errorVerification = ConcurrentRequestHelper.verifyExpectedErrors(
        concurrentResult.failureResults,
        "DUPLICATE_REGISTRATION"
      );
      expect(errorVerification.success).toBe(true);
      expect(errorVerification.matchingErrors).toBe(2);

      // データベース整合性確認
      const dbStateVerification = await DatabaseStateHelper.verifyDatabaseState({
        eventId: testData.freeEvent.id,
        expectedAttendingCount: 1,
        checkPaymentConsistency: false, // 無料イベントのため決済チェックは不要
      });

      expect(dbStateVerification.isValid).toBe(true);
      expect(dbStateVerification.details.duplicateEmails.hasDuplicates).toBe(false);
    });

    it("同一メールアドレスで有料イベントに同時参加登録 → 1名のみ成功し決済も整合すること", async () => {
      const duplicateEmail = "paid-duplicate-test@example.com";

      const participants: ParticipationFormData[] = [
        {
          inviteToken: testData.testEvent.invite_token,
          nickname: "有料重複者1",
          email: duplicateEmail,
          attendanceStatus: "attending" as AttendanceStatus,
          paymentMethod: "stripe" as PaymentMethod,
        },
        {
          inviteToken: testData.testEvent.invite_token,
          nickname: "有料重複者2",
          email: duplicateEmail,
          attendanceStatus: "attending" as AttendanceStatus,
          paymentMethod: "stripe" as PaymentMethod,
        },
      ];

      // 同時実行
      const concurrentResult = await ConcurrentRequestHelper.executeParticipationRequests(
        participants,
        { timeout: 10000 }
      );

      // 正確に1つのリクエストのみ成功
      const verification = ConcurrentRequestHelper.verifyExactlyOneSuccess(
        concurrentResult.results
      );
      expect(verification.success).toBe(true);
      expect(verification.successCount).toBe(1);
      expect(verification.failureCount).toBe(1);

      // 成功リクエストで決済が必要なことを確認
      const successResult = verification.successResult;
      expect(successResult!.data?.requiresAdditionalPayment).toBe(true);

      // データベース整合性確認（決済レコードも含む）
      const dbStateVerification = await DatabaseStateHelper.verifyDatabaseState({
        eventId: testData.testEvent.id,
        expectedAttendingCount: 1,
        checkPaymentConsistency: true, // 有料イベントのため決済チェック必要
      });

      expect(dbStateVerification.isValid).toBe(true);
      expect(dbStateVerification.details.paymentConsistency?.isConsistent).toBe(true);
      expect(dbStateVerification.details.paymentConsistency?.paymentCount).toBe(1);
      expect(dbStateVerification.details.duplicateEmails.hasDuplicates).toBe(false);
    });

    it("異なるメールアドレスでは同時参加登録が可能なこと（対照テスト）", async () => {
      // 異なるメールアドレスでの参加データ
      const participants: ParticipationFormData[] = [
        {
          inviteToken: testData.freeEvent.invite_token,
          nickname: "参加者A",
          email: "unique-a@example.com", // 異なるメール
          attendanceStatus: "attending" as AttendanceStatus,
        },
        {
          inviteToken: testData.freeEvent.invite_token,
          nickname: "参加者B",
          email: "unique-b@example.com", // 異なるメール
          attendanceStatus: "attending" as AttendanceStatus,
        },
      ];

      // 同時実行
      const concurrentResult = await ConcurrentRequestHelper.executeParticipationRequests(
        participants,
        { timeout: 10000 }
      );

      // 異なるメールアドレスなので両方とも成功するはず
      expect(concurrentResult.successCount).toBe(2);
      expect(concurrentResult.failureCount).toBe(0);

      // 参加者数は2名
      const attendanceCountVerification = await DatabaseStateHelper.verifyAttendanceCount(
        testData.freeEvent.id,
        2
      );
      expect(attendanceCountVerification.isValid).toBe(true);

      // 重複メールアドレスは存在しない
      const duplicateEmailVerification = await DatabaseStateHelper.verifyNoDuplicateEmails(
        testData.freeEvent.id
      );
      expect(duplicateEmailVerification.hasDuplicates).toBe(false);
    });

    it("同一メールアドレスでnot_attendingとattendingの組み合わせ → 1名のみ成功すること（UNIQUE制約）", async () => {
      const duplicateEmail = "mixed-status-test@example.com";

      const participants: ParticipationFormData[] = [
        {
          inviteToken: testData.freeEvent.invite_token,
          nickname: "不参加者",
          email: duplicateEmail,
          attendanceStatus: "not_attending" as AttendanceStatus,
          // 不参加のためpaymentMethodは未設定
        },
        {
          inviteToken: testData.freeEvent.invite_token,
          nickname: "参加者",
          email: duplicateEmail, // 同じメールアドレス
          attendanceStatus: "attending" as AttendanceStatus,
        },
      ];

      // 同時実行
      const concurrentResult = await ConcurrentRequestHelper.executeParticipationRequests(
        participants,
        { timeout: 10000 }
      );

      // 実装では event_id + email の UNIQUE制約により、参加ステータスに関係なく1つのみ成功
      expect(concurrentResult.successCount).toBe(1);
      expect(concurrentResult.failureCount).toBe(1);

      // 失敗リクエストが適切なエラー型であることを確認
      const errorVerification = ConcurrentRequestHelper.verifyExpectedErrors(
        concurrentResult.failureResults,
        "DUPLICATE_REGISTRATION"
      );
      expect(errorVerification.success).toBe(true);

      // メールアドレス重複制約により、参加者総数は1名
      const duplicateEmailVerification = await DatabaseStateHelper.verifyNoDuplicateEmails(
        testData.freeEvent.id
      );
      expect(duplicateEmailVerification.hasDuplicates).toBe(false);

      // 成功したリクエストがいずれかの参加者を登録していることを確認
      expect(concurrentResult.successResults.length).toBe(1);
      expect(concurrentResult.successResults[0].success).toBe(true);
    });

    it("大文字小文字の異なるメールアドレスでは重複として扱われること", async () => {
      // 大文字小文字が異なる同一メールアドレス
      const participants: ParticipationFormData[] = [
        {
          inviteToken: testData.freeEvent.invite_token,
          nickname: "参加者小文字",
          email: "case.test@example.com", // 小文字
          attendanceStatus: "attending" as AttendanceStatus,
        },
        {
          inviteToken: testData.freeEvent.invite_token,
          nickname: "参加者大文字",
          email: "Case.Test@Example.Com", // 大文字混在
          attendanceStatus: "attending" as AttendanceStatus,
        },
      ];

      // 同時実行
      const concurrentResult = await ConcurrentRequestHelper.executeParticipationRequests(
        participants,
        { timeout: 10000 }
      );

      // メールアドレスは大文字小文字を区別しないため、1つのみ成功
      const verification = ConcurrentRequestHelper.verifyExactlyOneSuccess(
        concurrentResult.results
      );
      expect(verification.success).toBe(true);

      // 失敗はDUPLICATE_REGISTRATIONエラー
      const errorVerification = ConcurrentRequestHelper.verifyExpectedErrors(
        concurrentResult.failureResults,
        "DUPLICATE_REGISTRATION"
      );
      expect(errorVerification.success).toBe(true);

      // データベース内に重複メールは存在しない
      const duplicateEmailVerification = await DatabaseStateHelper.verifyNoDuplicateEmails(
        testData.freeEvent.id
      );
      expect(duplicateEmailVerification.hasDuplicates).toBe(false);
    });
  });

  describe("TC-RC-003: ゲストトークン重複レースコンディション対応テスト", () => {
    let setup: RaceConditionTestSetup;
    let testData: RaceConditionTestData;
    let securityLogCapture: ReturnType<
      typeof import("@tests/helpers/mock-setup.helper").MockSetupHelper.captureSecurityLogs
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
          (log) =>
            log.type === "SUSPICIOUS_ACTIVITY" && log.message.includes("guest token collision")
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
});
