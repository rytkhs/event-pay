/**
 * P0-2: データベーストランザクション整合性テスト共通セットアップ
 */

import { expect } from "@jest/globals";

import { getSecureClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";

import { type TestPaymentUser, type TestPaymentEvent } from "@tests/helpers/test-payment-data";
import { createPaymentTestSetup } from "@tests/setup/common-test-setup";

import type { Database } from "@/types/database";

type AttendanceStatus = Database["public"]["Enums"]["attendance_status_enum"];
type PaymentMethod = Database["public"]["Enums"]["payment_method_enum"];
type PaymentStatus = Database["public"]["Enums"]["payment_status_enum"];

export interface TestData {
  user: TestPaymentUser;
  paidEvent: TestPaymentEvent;
}

// テスト用データ型
export interface DirectAttendanceData {
  event_id: string;
  nickname: string;
  email: string;
  status: AttendanceStatus;
  guest_token: string;
}

export interface DirectPaymentData {
  attendance_id: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
}

/**
 * データベース直接操作ヘルパークラス
 * 実際のDB制約違反とトランザクション整合性を検証するためのユーティリティ
 */
export class DatabaseTestHelper {
  /**
   * attendancesテーブルに直接挿入（管理者権限・RLSバイパス）
   */
  static async createDirectAttendance(data: DirectAttendanceData): Promise<any> {
    const clientFactory = getSecureClientFactory();
    const adminClient = await clientFactory.createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "P0-2_DIRECT_ATTENDANCE_INSERT"
    );

    const { data: result, error } = await adminClient
      .from("attendances")
      .insert(data)
      .select()
      .single();

    if (error) throw error;
    return result;
  }

  /**
   * paymentsテーブルに直接挿入（制約違反テスト用）
   */
  static async createDirectPayment(data: DirectPaymentData): Promise<any> {
    const clientFactory = getSecureClientFactory();
    const adminClient = await clientFactory.createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "P0-2_DIRECT_PAYMENT_INSERT"
    );

    const { data: result, error } = await adminClient
      .from("payments")
      .insert(data)
      .select()
      .single();

    if (error) throw error;
    return result;
  }

  /**
   * ストアドプロシージャ直接呼び出し（管理者権限）
   */
  static async callStoredProcedure(
    functionName: string,
    params: Record<string, any>
  ): Promise<{ data: any; error: any }> {
    const clientFactory = getSecureClientFactory();
    const adminClient = await clientFactory.createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "P0-2_STORED_PROCEDURE_CALL"
    );

    return await adminClient.rpc(functionName, params);
  }

  /**
   * 制約違反状態の準備
   */
  static async setupConstraintViolationScenario(
    scenario: "unique_open_payment" | "guest_token_duplicate" | "email_duplicate",
    eventId: string
  ): Promise<any> {
    switch (scenario) {
      case "unique_open_payment": {
        // unique_open_payment_per_attendance制約違反状態を作成
        const attendance = await this.createDirectAttendance({
          event_id: eventId,
          nickname: "制約テスト参加者",
          email: "constraint@test.example.com",
          status: "attending",
          guest_token: "gst_constraint1234567890123456789012", // 36文字
        });

        await this.createDirectPayment({
          attendance_id: attendance.id,
          amount: 2000,
          method: "stripe",
          status: "pending", // ← pending状態でUNIQUE制約が有効
        });

        return { attendance };
      }

      case "guest_token_duplicate": {
        const duplicateToken = "gst_dup12345678901234567890123456789";
        const attendance = await this.createDirectAttendance({
          event_id: eventId,
          nickname: "重複トークン参加者",
          email: "duplicate-token@test.example.com",
          status: "attending",
          guest_token: duplicateToken,
        });

        return { attendance, duplicateToken };
      }

      case "email_duplicate": {
        const duplicateEmail = "duplicate@test.example.com";
        const attendance = await this.createDirectAttendance({
          event_id: eventId,
          nickname: "重複メール参加者",
          email: duplicateEmail,
          status: "attending",
          guest_token: "gst_emaildup123456789012345678901234",
        });

        return { attendance, duplicateEmail };
      }

      default:
        throw new Error(`Unknown scenario: ${scenario}`);
    }
  }

  /**
   * データベース状態の確認（トランザクション整合性検証）
   */
  static async verifyDatabaseState(checks: {
    attendanceExists?: { eventId: string; email: string; shouldExist: boolean };
    paymentExists?: { attendanceId: string; shouldExist: boolean };
    attendanceCount?: { eventId: string; expectedCount: number };
  }): Promise<void> {
    const clientFactory = getSecureClientFactory();
    const adminClient = await clientFactory.createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "P0-2_DATABASE_STATE_VERIFICATION"
    );

    if (checks.attendanceExists) {
      const { eventId, email, shouldExist } = checks.attendanceExists;
      const { data } = await adminClient
        .from("attendances")
        .select("*")
        .eq("event_id", eventId)
        .eq("email", email);

      if (shouldExist) {
        expect(data).toHaveLength(1);
      } else {
        expect(data).toHaveLength(0);
      }
    }

    if (checks.paymentExists) {
      const { attendanceId, shouldExist } = checks.paymentExists;
      const { data } = await adminClient
        .from("payments")
        .select("*")
        .eq("attendance_id", attendanceId);

      if (shouldExist) {
        expect(data?.length).toBeGreaterThan(0);
      } else {
        expect(data).toHaveLength(0);
      }
    }

    if (checks.attendanceCount) {
      const { eventId, expectedCount } = checks.attendanceCount;
      const { count } = await adminClient
        .from("attendances")
        .select("*", { count: "exact", head: true })
        .eq("event_id", eventId);

      expect(count).toBe(expectedCount);
    }
  }
}

export interface DatabaseTransactionTestSetup {
  testData: TestData;
  cleanup: () => Promise<void>;
}

/**
 * テストセットアップ関数
 */
export async function setupDatabaseTransactionTest(): Promise<DatabaseTransactionTestSetup> {
  // 共通決済テストセットアップを使用
  const paymentSetup = await createPaymentTestSetup({
    testName: `database-transaction-test-${Date.now()}`,
    eventFee: 2000, // 有料イベント
    paymentMethods: ["stripe"],
    accessedTables: ["public.events", "public.attendances", "public.payments"],
  });

  const testData: TestData = {
    user: paymentSetup.testUser,
    paidEvent: paymentSetup.testEvent,
  };

  return {
    testData,
    cleanup: paymentSetup.cleanup,
  };
}
