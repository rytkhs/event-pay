/**
 * 共通クリーンアップ関数
 *
 * テストコードの重複を削減するための共通クリーンアップ関数群
 * エラーハンドリングを改善し、クリーンアップ失敗がテストを失敗させないようにする
 */

import { cleanupTestPaymentData } from "@tests/helpers/test-payment-data";
import { deleteTestUser } from "@tests/helpers/test-user";

/**
 * クリーンアップ対象のデータID
 */
export interface CleanupDataIds {
  /**
   * 決済IDの配列
   */
  paymentIds?: string[];
  /**
   * 参加登録IDの配列
   */
  attendanceIds?: string[];
  /**
   * イベントIDの配列
   */
  eventIds?: string[];
  /**
   * ユーザーIDの配列（public.usersとauth.usersの両方を削除）
   */
  userIds?: string[];
  /**
   * ユーザーのメールアドレスの配列（deleteTestUserで使用）
   */
  userEmails?: string[];
}

/**
 * クリーンアップ結果
 */
export interface CleanupResult {
  /**
   * 成功したかどうか
   */
  success: boolean;
  /**
   * エラーメッセージ（失敗した場合）
   */
  errors: string[];
  /**
   * クリーンアップされたアイテム数
   */
  cleanedItems: {
    payments: number;
    attendances: number;
    events: number;
    users: number;
  };
}

/**
 * テストデータを安全にクリーンアップする
 *
 * エラーが発生してもテストを失敗させず、ログを出力する
 * 複数のクリーンアップ操作を順次実行し、各操作のエラーを記録する
 *
 * @param dataIds クリーンアップ対象のデータID
 * @param options クリーンアップオプション
 * @returns クリーンアップ結果
 *
 * @example
 * ```typescript
 * const result = await safeCleanupTestData({
 *   attendanceIds: [testAttendance.id],
 *   eventIds: [testEvent.id],
 *   userEmails: [testUser.email],
 * });
 *
 * if (!result.success) {
 *   console.warn("Some cleanup operations failed:", result.errors);
 * }
 * ```
 */
export async function safeCleanupTestData(
  dataIds: CleanupDataIds,
  options: {
    /**
     * エラーをthrowするかどうか（デフォルト: false）
     */
    throwOnError?: boolean;
    /**
     * クリーンアップの詳細ログを出力するかどうか（デフォルト: true）
     */
    verbose?: boolean;
  } = {}
): Promise<CleanupResult> {
  const { throwOnError = false, verbose = true } = options;
  const errors: string[] = [];
  const cleanedItems = {
    payments: 0,
    attendances: 0,
    events: 0,
    users: 0,
  };

  // 決済データ、参加登録、イベントのクリーンアップ
  const hasPaymentData =
    dataIds.paymentIds?.length ||
    dataIds.attendanceIds?.length ||
    dataIds.eventIds?.length ||
    dataIds.userIds?.length;

  if (hasPaymentData) {
    try {
      await cleanupTestPaymentData({
        paymentIds: dataIds.paymentIds,
        attendanceIds: dataIds.attendanceIds,
        eventIds: dataIds.eventIds,
        userIds: dataIds.userIds,
      });

      cleanedItems.payments = dataIds.paymentIds?.length || 0;
      cleanedItems.attendances = dataIds.attendanceIds?.length || 0;
      cleanedItems.events = dataIds.eventIds?.length || 0;

      if (verbose) {
        // eslint-disable-next-line no-console
        console.log(
          `✓ Cleaned up ${cleanedItems.payments} payments, ${cleanedItems.attendances} attendances, ${cleanedItems.events} events`
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to cleanup payment data: ${errorMessage}`);
      console.warn("⚠ Failed to cleanup payment data:", error);

      if (throwOnError) {
        throw error;
      }
    }
  }

  // ユーザーのクリーンアップ（メールアドレスから削除）
  if (dataIds.userEmails?.length) {
    const userCleanupResults = await Promise.allSettled(
      dataIds.userEmails.map((email) => deleteTestUser(email))
    );

    let successCount = 0;
    userCleanupResults.forEach((result, index) => {
      if (result.status === "fulfilled") {
        successCount++;
      } else {
        const email = dataIds.userEmails?.[index];
        if (email) {
          const errorMessage =
            result.reason instanceof Error ? result.reason.message : String(result.reason);
          errors.push(`Failed to delete user ${email}: ${errorMessage}`);
          console.warn(`⚠ Failed to delete user ${email}:`, result.reason);
        }
      }
    });

    cleanedItems.users = successCount;

    if (verbose) {
      // eslint-disable-next-line no-console
      console.log(`✓ Cleaned up ${successCount}/${dataIds.userEmails.length} users`);
    }
  }

  // ユーザーIDから直接削除する場合（userEmailsが指定されていない場合）
  if (dataIds.userIds?.length && !dataIds.userEmails?.length) {
    // 注意: userIdsのみが指定された場合、deleteTestUserは使用できない
    // この場合はcleanupTestPaymentDataで処理される（stripe_connect_accountsのみ）
    // auth.usersの削除は別途必要
    if (verbose) {
      console.warn(
        "⚠ userIds specified without userEmails. Only stripe_connect_accounts will be cleaned up. Use userEmails for complete user cleanup."
      );
    }
  }

  const success = errors.length === 0;

  if (!success && verbose) {
    console.warn(`⚠ Cleanup completed with ${errors.length} error(s)`);
  }

  return {
    success,
    errors,
    cleanedItems,
  };
}

/**
 * テストデータをクリーンアップする（簡易版）
 *
 * safeCleanupTestDataのラッパーで、エラーをthrowしない
 * 最も一般的な使用ケースに対応
 *
 * @param dataIds クリーンアップ対象のデータID
 *
 * @example
 * ```typescript
 * await cleanupTestData({
 *   attendanceIds: [testAttendance.id],
 *   eventIds: [testEvent.id],
 *   userEmails: [testUser.email],
 * });
 * ```
 */
export async function cleanupTestData(dataIds: CleanupDataIds): Promise<void> {
  await safeCleanupTestData(dataIds, { throwOnError: false, verbose: true });
}

/**
 * 複数のクリーンアップ操作を順次実行する
 *
 * 各操作のエラーを記録し、すべての操作を試行する
 *
 * @param cleanupOperations クリーンアップ操作の配列
 * @returns クリーンアップ結果
 *
 * @example
 * ```typescript
 * await cleanupSequentially([
 *   () => cleanupTestData({ attendanceIds: [attendance1.id] }),
 *   () => cleanupTestData({ attendanceIds: [attendance2.id] }),
 * ]);
 * ```
 */
export async function cleanupSequentially(
  cleanupOperations: Array<() => Promise<void>>
): Promise<CleanupResult> {
  const errors: string[] = [];
  const cleanedItems = {
    payments: 0,
    attendances: 0,
    events: 0,
    users: 0,
  };

  for (let i = 0; i < cleanupOperations.length; i++) {
    try {
      await cleanupOperations[i]();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`Cleanup operation ${i + 1} failed: ${errorMessage}`);
      console.warn(`⚠ Cleanup operation ${i + 1} failed:`, error);
    }
  }

  return {
    success: errors.length === 0,
    errors,
    cleanedItems,
  };
}

/**
 * 決済レコードをクリーンアップ
 *
 * 注意: この関数は`cleanupTestPaymentData`を使用して実装されています。
 * エラーが発生してもテストを失敗させない安全なクリーンアップが必要な場合は、
 * `safeCleanupTestData`または`cleanupTestData`を使用してください。
 *
 * @param paymentIds 決済IDの配列
 * @param adminClient Supabase adminクライアント（オプション、未使用、後方互換性のため残存）
 * @returns 削除されたレコード数
 *
 * @example
 * ```typescript
 * // 基本的な使用
 * await cleanupPayments([payment1.id, payment2.id]);
 *
 * // エラーハンドリングが必要な場合
 * try {
 *   await cleanupPayments([payment1.id]);
 * } catch (error) {
 *   console.warn("Failed to cleanup payments:", error);
 * }
 * ```
 */
export async function cleanupPayments(
  paymentIds: string[],
  _adminClient?: any // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<number> {
  if (paymentIds.length === 0) {
    return 0;
  }

  try {
    await cleanupTestPaymentData({
      paymentIds,
    });
    return paymentIds.length;
  } catch (error) {
    console.warn("Error during payment cleanup:", error);
    throw error;
  }
}

/**
 * 参加レコードをクリーンアップ
 *
 * 注意: この関数は`cleanupTestPaymentData`を使用して実装されています。
 * エラーが発生してもテストを失敗させない安全なクリーンアップが必要な場合は、
 * `safeCleanupTestData`または`cleanupTestData`を使用してください。
 *
 * @param attendanceIds 参加IDの配列
 * @param adminClient Supabase adminクライアント（オプション、未使用、後方互換性のため残存）
 * @returns 削除されたレコード数
 *
 * @example
 * ```typescript
 * // 基本的な使用
 * await cleanupAttendances([attendance1.id, attendance2.id]);
 *
 * // エラーハンドリングが必要な場合
 * try {
 *   await cleanupAttendances([attendance1.id]);
 * } catch (error) {
 *   console.warn("Failed to cleanup attendances:", error);
 * }
 * ```
 */
export async function cleanupAttendances(
  attendanceIds: string[],
  _adminClient?: any // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<number> {
  if (attendanceIds.length === 0) {
    return 0;
  }

  try {
    await cleanupTestPaymentData({
      attendanceIds,
    });
    return attendanceIds.length;
  } catch (error) {
    console.warn("Error during attendance cleanup:", error);
    throw error;
  }
}

/**
 * イベントレコードをクリーンアップ
 *
 * 注意: この関数は`cleanupTestPaymentData`を使用して実装されています。
 * エラーが発生してもテストを失敗させない安全なクリーンアップが必要な場合は、
 * `safeCleanupTestData`または`cleanupTestData`を使用してください。
 *
 * @param eventIds イベントIDの配列
 * @param adminClient Supabase adminクライアント（オプション、未使用、後方互換性のため残存）
 * @returns 削除されたレコード数
 *
 * @example
 * ```typescript
 * // 基本的な使用
 * await cleanupEvents([event1.id, event2.id]);
 *
 * // エラーハンドリングが必要な場合
 * try {
 *   await cleanupEvents([event1.id]);
 * } catch (error) {
 *   console.warn("Failed to cleanup events:", error);
 * }
 * ```
 */
export async function cleanupEvents(
  eventIds: string[],
  _adminClient?: any // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<number> {
  if (eventIds.length === 0) {
    return 0;
  }

  try {
    await cleanupTestPaymentData({
      eventIds,
    });
    return eventIds.length;
  } catch (error) {
    console.warn("Error during event cleanup:", error);
    throw error;
  }
}

/**
 * ユーザーレコードをクリーンアップ
 *
 * public.users、stripe_connect_accounts、auth.usersを削除します。
 *
 * @param userEmails ユーザーのメールアドレスの配列
 * @returns 削除されたユーザー数
 *
 * @example
 * ```typescript
 * await cleanupUsers([user1.email, user2.email]);
 * ```
 */
export async function cleanupUsers(userEmails: string[]): Promise<number> {
  if (userEmails.length === 0) {
    return 0;
  }

  const results = await Promise.allSettled(userEmails.map((email) => deleteTestUser(email)));

  let successCount = 0;
  results.forEach((result) => {
    if (result.status === "fulfilled") {
      successCount++;
    } else {
      console.warn("Failed to delete user:", result.reason);
    }
  });

  return successCount;
}

/**
 * クリーンアップトラッカーを作成
 *
 * 作成したリソースIDを追跡し、一括でクリーンアップするためのヘルパーです。
 * この関数は、テスト間で作成されたリソース（イベント、参加、決済、ユーザー）を
 * 追跡し、`afterAll`や`afterEach`で一括クリーンアップするために使用します。
 *
 * **使い分け:**
 * - `createCleanupTracker`: テストスイート全体（`afterAll`）でのクリーンアップに使用
 *   - ユーザーのクリーンアップも含む
 *   - より包括的なクリーンアップが必要な場合
 * - `createTestDataCleanupHelper`（`common-test-setup.ts`）: テスト間（`afterEach`）でのクリーンアップに使用
 *   - イベント、参加、決済のみ（ユーザーは含まない）
 *   - より軽量で高速なクリーンアップが必要な場合
 *
 * @param adminClient Supabase adminクライアント（オプション、未使用、後方互換性のため残存）
 * @returns クリーンアップトラッカーオブジェクト
 *
 * @example
 * ```typescript
 * describe("テストスイート", () => {
 *   let tracker: ReturnType<typeof createCleanupTracker>;
 *
 *   beforeAll(async () => {
 *     tracker = createCleanupTracker();
 *   });
 *
 *   afterAll(async () => {
 *     const result = await tracker.executeCleanup();
 *     if (!result.success) {
 *       console.warn("Some cleanup operations failed:", result.errors);
 *     }
 *   });
 *
 *   test("リソースを作成", async () => {
 *     const event = await createEvent(...);
 *     tracker.trackEvent(event.id);
 *
 *     const attendance = await createAttendance(...);
 *     tracker.trackAttendance(attendance.id);
 *
 *     const payment = await createPayment(...);
 *     tracker.trackPayment(payment.id);
 *
 *     // ユーザーも追跡可能
 *     tracker.trackUser(user.id, user.email);
 *   });
 * });
 * ```
 */
export function createCleanupTracker(_adminClient?: any) {
  // eslint-disable-line @typescript-eslint/no-explicit-any
  const eventIds: string[] = [];
  const attendanceIds: string[] = [];
  const paymentIds: string[] = [];
  const userIds: string[] = [];
  const userEmails: string[] = [];

  return {
    trackEvent: (eventId: string) => {
      eventIds.push(eventId);
    },
    trackAttendance: (attendanceId: string) => {
      attendanceIds.push(attendanceId);
    },
    trackPayment: (paymentId: string) => {
      paymentIds.push(paymentId);
    },
    trackUser: (userId: string, email?: string) => {
      userIds.push(userId);
      if (email) {
        userEmails.push(email);
      }
    },
    executeCleanup: async () => {
      // 外部キー制約を考慮した削除順序: payments → attendances → events → stripe_connect_accounts → users
      // safeCleanupTestDataを使用してエラーハンドリングを統一
      const result = await safeCleanupTestData(
        {
          paymentIds,
          attendanceIds,
          eventIds,
          userIds,
          userEmails,
        },
        {
          throwOnError: false,
          verbose: true,
        }
      );

      return {
        success: result.success,
        errors: result.errors,
      };
    },
    reset: () => {
      eventIds.length = 0;
      attendanceIds.length = 0;
      paymentIds.length = 0;
      userIds.length = 0;
      userEmails.length = 0;
    },
  };
}
