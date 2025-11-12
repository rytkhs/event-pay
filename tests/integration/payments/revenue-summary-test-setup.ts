/**
 * 売上集計テスト共通セットアップ
 *
 * 共通セットアップ関数を使用してリファクタリング済み
 */

import { type TestPaymentEvent } from "@/tests/helpers/test-payment-data";
import { createPaymentTestSetup } from "@/tests/setup/common-test-setup";

export interface RevenueSummaryTestSetup {
  supabase: any;
  testUser: any;
  testEvent: TestPaymentEvent;
  cleanup: () => Promise<void>;
}

export async function setupRevenueSummaryTest(): Promise<RevenueSummaryTestSetup> {
  // 共通決済テストセットアップを使用
  const paymentSetup = await createPaymentTestSetup({
    testName: `revenue-summary-test-${Date.now()}`,
    eventFee: 1000,
    accessedTables: ["public.payments", "public.attendances", "public.events"],
  });

  // 後方互換性のため、supabaseという名前でエクスポート
  const supabase = paymentSetup.adminClient;

  return {
    supabase,
    testUser: paymentSetup.testUser,
    testEvent: paymentSetup.testEvent,
    cleanup: paymentSetup.cleanup,
  };
}
