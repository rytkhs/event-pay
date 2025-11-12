/**
 * 決済キャンセル処理統合テスト共通セットアップ
 *
 * 共通セットアップ関数を使用してリファクタリング済み
 */

import { type TestPaymentUser, type TestPaymentEvent } from "@tests/helpers/test-payment-data";
import { createPaymentTestSetup } from "@tests/setup/common-test-setup";

export interface PaymentCancellationTestSetup {
  adminClient: any;
  testUser: TestPaymentUser;
  testEvent: TestPaymentEvent;
  cleanup: () => Promise<void>;
}

/**
 * 決済キャンセル処理テストのセットアップ
 *
 * @returns テストデータと管理者クライアントを含むセットアップオブジェクト
 */
export async function setupPaymentCancellationTest(): Promise<PaymentCancellationTestSetup> {
  console.log("🔧 決済キャンセル処理統合テスト セットアップ開始");

  // 共通決済テストセットアップを使用
  const paymentSetup = await createPaymentTestSetup({
    testName: `cancel-test-${Date.now()}`,
    eventFee: 1000,
    accessedTables: ["public.users", "public.events", "public.attendances", "public.payments"],
  });

  console.log(`✅ テストデータセットアップ完了 - Event: ${paymentSetup.testEvent.id}`);

  return {
    adminClient: paymentSetup.adminClient,
    testUser: paymentSetup.testUser,
    testEvent: paymentSetup.testEvent,
    cleanup: paymentSetup.cleanup,
  };
}
