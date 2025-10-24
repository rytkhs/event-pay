/**
 * データベース状態検証ヘルパー
 *
 * レースコンディションテスト後のデータ整合性検証を提供
 * 仕様書: P0-3_race_condition_specification.md 5.3節実装
 */

import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";

import type { Database } from "@/types/database";

type AttendanceStatus = Database["public"]["Enums"]["attendance_status_enum"];

export interface DatabaseStateVerificationOptions {
  eventId: string;
  expectedAttendingCount: number;
  checkPaymentConsistency?: boolean;
  checkOrphanedRecords?: boolean;
}

export interface AttendanceCountResult {
  actualCount: number;
  expectedCount: number;
  isValid: boolean;
  message: string;
}

export interface PaymentConsistencyResult {
  attendingCount: number;
  paymentCount: number;
  isConsistent: boolean;
  message: string;
  orphanedPayments?: any[];
}

/**
 * データベース状態検証ヘルパークラス
 *
 * レースコンディションテスト後のデータベース整合性を検証
 */
export class DatabaseStateHelper {
  /**
   * 参加者数が期待値と一致することを検証
   *
   * @param eventId イベントID
   * @param expectedCount 期待される参加者数
   * @param status 検証対象の参加ステータス（デフォルト: 'attending'）
   * @returns 検証結果
   */
  static async verifyAttendanceCount(
    eventId: string,
    expectedCount: number,
    status: AttendanceStatus = "attending"
  ): Promise<AttendanceCountResult> {
    try {
      const clientFactory = SecureSupabaseClientFactory.create();
      const adminClient = await clientFactory.createAuditedAdminClient(
        AdminReason.TEST_DATA_SETUP,
        "Verifying attendance count for race condition test"
      );

      const { count, error } = await adminClient
        .from("attendances")
        .select("*", { count: "exact", head: true })
        .eq("event_id", eventId)
        .eq("status", status);

      if (error) {
        return {
          actualCount: -1,
          expectedCount,
          isValid: false,
          message: `データベースエラー: ${error.message}`,
        };
      }

      const actualCount = count ?? 0;
      const isValid = actualCount === expectedCount;

      return {
        actualCount,
        expectedCount,
        isValid,
        message: isValid
          ? `参加者数が期待値と一致: ${actualCount}名`
          : `参加者数が期待値と不一致: 実際=${actualCount}名, 期待=${expectedCount}名`,
      };
    } catch (error) {
      return {
        actualCount: -1,
        expectedCount,
        isValid: false,
        message: `検証エラー: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * 決済レコードが参加者数と一致することを検証
   *
   * @param eventId イベントID
   * @returns 検証結果
   */
  static async verifyPaymentConsistency(eventId: string): Promise<PaymentConsistencyResult> {
    try {
      const clientFactory = SecureSupabaseClientFactory.create();
      const adminClient = await clientFactory.createAuditedAdminClient(
        AdminReason.TEST_DATA_SETUP,
        "Verifying payment consistency for race condition test"
      );

      // 参加者数を取得
      const { count: attendingCount, error: attendanceError } = await adminClient
        .from("attendances")
        .select("*", { count: "exact", head: true })
        .eq("event_id", eventId)
        .eq("status", "attending");

      if (attendanceError) {
        return {
          attendingCount: -1,
          paymentCount: -1,
          isConsistent: false,
          message: `参加者数取得エラー: ${attendanceError.message}`,
        };
      }

      // 決済レコード数を取得
      const { count: paymentCount, error: paymentError } = await adminClient
        .from("payments")
        .select(
          `
          id,
          attendances!inner(event_id, status)
        `,
          { count: "exact", head: true }
        )
        .eq("attendances.event_id", eventId)
        .eq("attendances.status", "attending");

      if (paymentError) {
        return {
          attendingCount: attendingCount ?? 0,
          paymentCount: -1,
          isConsistent: false,
          message: `決済レコード数取得エラー: ${paymentError.message}`,
        };
      }

      const actualAttendingCount = attendingCount ?? 0;
      const actualPaymentCount = paymentCount ?? 0;
      const isConsistent = actualAttendingCount === actualPaymentCount;

      return {
        attendingCount: actualAttendingCount,
        paymentCount: actualPaymentCount,
        isConsistent,
        message: isConsistent
          ? `決済レコード数が参加者数と一致: ${actualPaymentCount}件`
          : `決済レコード数が参加者数と不一致: 参加者=${actualAttendingCount}名, 決済=${actualPaymentCount}件`,
      };
    } catch (error) {
      return {
        attendingCount: -1,
        paymentCount: -1,
        isConsistent: false,
        message: `検証エラー: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * 孤立した決済レコードが存在しないことを検証
   *
   * @param eventId イベントID
   * @returns 検証結果
   */
  static async verifyNoOrphanedPayments(eventId: string): Promise<{
    hasOrphans: boolean;
    orphanCount: number;
    message: string;
    orphanedPayments?: any[];
  }> {
    try {
      const clientFactory = SecureSupabaseClientFactory.create();
      const adminClient = await clientFactory.createAuditedAdminClient(
        AdminReason.TEST_DATA_SETUP,
        "Checking for orphaned payments in race condition test"
      );

      // attending 以外のステータスに関連付けられた決済レコードを取得
      const { data: orphanedPayments, error } = await adminClient
        .from("payments")
        .select(
          `
          id,
          amount,
          status,
          attendances!inner(id, event_id, status, email)
        `
        )
        .eq("attendances.event_id", eventId)
        .neq("attendances.status", "attending");

      if (error) {
        return {
          hasOrphans: false,
          orphanCount: -1,
          message: `孤立した決済レコード検証エラー: ${error.message}`,
        };
      }

      const orphanCount = orphanedPayments?.length ?? 0;
      const hasOrphans = orphanCount > 0;

      return {
        hasOrphans,
        orphanCount,
        message: hasOrphans
          ? `孤立した決済レコードが発見されました: ${orphanCount}件`
          : "孤立した決済レコードは存在しません",
        orphanedPayments: hasOrphans ? orphanedPayments : undefined,
      };
    } catch (error) {
      return {
        hasOrphans: false,
        orphanCount: -1,
        message: `検証エラー: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * 重複メールアドレスが存在しないことを検証
   *
   * @param eventId イベントID
   * @returns 検証結果
   */
  static async verifyNoDuplicateEmails(eventId: string): Promise<{
    hasDuplicates: boolean;
    duplicateCount: number;
    message: string;
    duplicateEmails?: string[];
  }> {
    try {
      const clientFactory = SecureSupabaseClientFactory.create();
      const adminClient = await clientFactory.createAuditedAdminClient(
        AdminReason.TEST_DATA_SETUP,
        "Checking for duplicate emails in race condition test"
      );

      // 同一イベント内での重複メールアドレスを検索
      const { data, error } = await adminClient.rpc("find_duplicate_emails_in_event", {
        p_event_id: eventId,
      });

      if (error) {
        // RPCが存在しない場合は、SQLクエリで直接実行
        const { data: attendances, error: attendanceError } = await adminClient
          .from("attendances")
          .select("email")
          .eq("event_id", eventId);

        if (attendanceError) {
          return {
            hasDuplicates: false,
            duplicateCount: -1,
            message: `重複メール検証エラー: ${attendanceError.message}`,
          };
        }

        // メールアドレスの重複をチェック
        const emailCounts = (attendances || []).reduce(
          (acc, attendance) => {
            const email = attendance.email;
            acc[email] = (acc[email] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        );

        const duplicateEmails = Object.keys(emailCounts).filter((email) => emailCounts[email] > 1);
        const hasDuplicates = duplicateEmails.length > 0;

        return {
          hasDuplicates,
          duplicateCount: duplicateEmails.length,
          message: hasDuplicates
            ? `重複メールアドレスが発見されました: ${duplicateEmails.join(", ")}`
            : "メールアドレスの重複は存在しません",
          duplicateEmails: hasDuplicates ? duplicateEmails : undefined,
        };
      }

      const duplicates = data || [];
      const hasDuplicates = duplicates.length > 0;

      return {
        hasDuplicates,
        duplicateCount: duplicates.length,
        message: hasDuplicates
          ? `重複メールアドレスが発見されました: ${duplicates.join(", ")}`
          : "メールアドレスの重複は存在しません",
        duplicateEmails: hasDuplicates ? duplicates : undefined,
      };
    } catch (error) {
      return {
        hasDuplicates: false,
        duplicateCount: -1,
        message: `検証エラー: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * 包括的なデータベース状態検証
   *
   * @param options 検証オプション
   * @returns 包括的な検証結果
   */
  static async verifyDatabaseState(options: DatabaseStateVerificationOptions): Promise<{
    isValid: boolean;
    message: string;
    details: {
      attendanceCount: AttendanceCountResult;
      paymentConsistency?: PaymentConsistencyResult;
      orphanedPayments?: Awaited<ReturnType<typeof DatabaseStateHelper.verifyNoOrphanedPayments>>;
      duplicateEmails: Awaited<ReturnType<typeof DatabaseStateHelper.verifyNoDuplicateEmails>>;
    };
  }> {
    const {
      eventId,
      expectedAttendingCount,
      checkPaymentConsistency = true,
      checkOrphanedRecords = true,
    } = options;

    // 参加者数検証
    const attendanceCount = await this.verifyAttendanceCount(eventId, expectedAttendingCount);

    // 決済整合性検証（オプション）
    let paymentConsistency: PaymentConsistencyResult | undefined;
    if (checkPaymentConsistency) {
      paymentConsistency = await this.verifyPaymentConsistency(eventId);
    }

    // 孤立した決済レコード検証（オプション）
    let orphanedPayments: Awaited<ReturnType<typeof this.verifyNoOrphanedPayments>> | undefined;
    if (checkOrphanedRecords) {
      orphanedPayments = await this.verifyNoOrphanedPayments(eventId);
    }

    // 重複メール検証
    const duplicateEmails = await this.verifyNoDuplicateEmails(eventId);

    // 全体的な検証結果判定
    const allValid =
      attendanceCount.isValid &&
      (!paymentConsistency || paymentConsistency.isConsistent) &&
      !orphanedPayments?.hasOrphans &&
      !duplicateEmails.hasDuplicates;

    const messages = [
      attendanceCount.message,
      paymentConsistency?.message,
      orphanedPayments?.message,
      duplicateEmails.message,
    ].filter(Boolean);

    return {
      isValid: allValid,
      message: allValid
        ? "すべてのデータベース整合性検証が成功"
        : `検証失敗: ${messages.join(", ")}`,
      details: {
        attendanceCount,
        paymentConsistency,
        orphanedPayments,
        duplicateEmails,
      },
    };
  }
}
